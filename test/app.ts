// The unified surface, booted against a stub DOM and canned API responses that match the REAL
// shapes from src/story.ts and src/routes.ts. This exists because twenty-one field names in
// web/app.js were wrong on the first pass — guessed rather than read — and every one of them
// would have rendered the string "undefined" into the page instead of throwing.
import assert from 'node:assert';
import { mock } from 'node:test';

/* THE SUITE RUNS ON A VIRTUAL CLOCK, since 2026-10-29. It took 44 of test/all.ts's 45 seconds on
 * 1.1 seconds of CPU: some 350 fixed waits of 20 to 1,100 ms, each one real time, against a fake
 * fetch that answers at once. The waits could not simply be removed: the app's own timers are real
 * behaviour under test — the 60 ms announcement, the 180 ms tap, the 220 and 250 ms search
 * debounces, the 450 ms hold, the one-second weaving count — and a check written as "wait 300 ms,
 * then the search has run" means exactly that.
 *
 * So `setTimeout`, `setInterval` and `Date` are node's mocks from here on, and `sleep(ms)` moves the
 * clock forward by `ms` in small steps, giving the event loop real turns between steps so a fetch
 * answered inside a timer is read before the next one fires. Every wait still lets the same amount
 * of app time pass, in the same order; it just no longer costs it. `setImmediate` stays real — it
 * is what the steps yield on.
 *
 * Two side effects, both wanted. A timer still pending when the last check runs (the toast's
 * 4.2-second hide, a weaving count) can no longer hold the process open after the verdict, which
 * cost 4.2 s at the end of every run. And nothing in this file may wait with a bare
 * `setTimeout(r, n)` any more: under the mock it never resolves unless a `sleep` is running, and
 * the suite hangs instead of failing. */
mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: Date.now() });
const STEP = 5;
const turns = async () => { for (let i = 0; i < 3; i++) await new Promise((r) => setImmediate(r)); };
const sleep = async (ms: number) => {
  for (let left = ms; left > 0; left -= STEP) { await turns(); mock.timers.tick(Math.min(STEP, left)); }
  await turns();
};

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

/** Whether the canned shelf owes anything. The light at the top is drawn from the LIBRARY rows, so
 *  the only way to make the dark case is to hand back a shelf with nothing on it — flipping a copy
 *  in the test would assert against a variable the app never reads. */
let shelfOwes = true;

// ---- the smallest DOM these render functions actually touch ----
const nodes = new Map<string, any>();
const el = (id: string) => {
  const o: any = {
    id, innerHTML: '', textContent: '', hidden: false, value: '', scrollTop: 0,
    scrollHeight: 0, clientHeight: 0, style: {}, dataset: {},
    // The reading pane toggles `scrolled` on itself so the running head can appear once the
    // chapter's band has gone by.
    // Kept, so a check can read a class a render set (the bar's `shut`, 2026-11-01).
    classList: (() => { const set = new Set<string>(); return {
      toggle: (c: string, on?: boolean) => { const v = on ?? !set.has(c); if (v) set.add(c); else set.delete(c); return v; },
      add: (...c: string[]) => c.forEach((x) => set.add(x)), remove: (...c: string[]) => c.forEach((x) => set.delete(x)),
      contains: (c: string) => set.has(c) }; })(),
    // Attributes are read back by the checks, so they are stored rather than swallowed: the
    // context meter carries its state on aria-expanded and data-ctxopen, and a stub that dropped
    // them would let a meter that never opens pass.
    attrs: {} as Record<string, string>,
    setAttribute(k: string, v: string) { o.attrs[k] = String(v); },
    getAttribute: (k: string) => o.attrs[k] ?? null,
    addEventListener() {}, focus() {}, closest: () => null,
    // The composer restores the caret after a repaint. Without this any path that lands a passage
    // and redraws the dock throws here, and the suite DIES instead of failing the check that was
    // watching — which is how a falsification came back green for the wrong reason.
    setSelectionRange() {}, select() {},
    querySelectorAll: () => [], querySelector: () => null,
    // ENOUGH GEOMETRY TO SEE WHERE THE PAGE LANDS. `pinTo` measures the seam against the reading
    // pane and scrolls to a point ABOVE the bottom; without these it fell through to the
    // scroll-to-bottom fallback and a check could not tell the two apart, which is the whole
    // question. The numbers are arbitrary and only have to be stable.
    getBoundingClientRect: () => ({ top: 0, bottom: 0 }),
    scrollTo(arg: any) { o.scrollTop = typeof arg === 'number' ? arg : Number(arg?.top ?? 0); },
    // ENOUGH TO BUILD AND TEAR DOWN THE VEIL. `ghost()` creates an element, fills it, appends it to
    // #shell and later removes it. None of that ran here until 2026-09-02: the old `else if (old)
    // return;` meant the second and every later call bailed before `createElement`, so the harness
    // was driving a function whose body it could not execute and nobody knew. `remove` is the same
    // story from the other end.
    append() {}, appendChild() {}, insertBefore() {}, remove() {},
  };
  nodes.set(id, o); return o;
};
for (const id of ['rail', 'bar', 'appearance', 'read', 'col', 'page', 'dock', 'dockCol',
                  'side', 'sideHead', 'sideBody', 'toast', 'scrim', 'input', 'q', 'idea',
                  // The context meter, the reading it opens, and the speaker strip. All three sit
                  // OUTSIDE the two elements their draw functions used to write into.
                  'ctxbar', 'ctxread', 'asRow', 'runhead',
                  // #books, added 2026-08-31. The Threads page redraws ONLY this element when a
                  // book group is opened — not the whole page — so without it registered here a
                  // press on a group did nothing the harness could see, and an assertion about
                  // what a group contains read the page as it was before the press.
                  'books',
                  // #announce, 2026-09-03. The one live region: what a screen reader is told when a
                  // passage lands, because the fade that says so is the one thing it cannot see.
                  'announce',
                  // #owed, 2026-09-03: the light along the top that says something wants you.
                  'owed']) el(id);

const listeners: Record<string, Function[]> = {};
(globalThis as any).document = {
  // `style.setProperty` because applyLook writes every theme token onto <html> as a custom
  // property now — the nine themes are derived from a table rather than nine blocks of CSS.
  documentElement: { dataset: {}, style: { setProperty() {} } },
  getElementById: (id: string) => nodes.get(id) ?? el(id),
  // Not registered in `nodes`: a created element is not findable by id until something appends it,
  // and nothing here models a tree. It only has to be safe to build, fill and throw away.
  // A made element's classList reads and writes its className, because the writing surface asks
  // which it is: `#ghost.veil` is the full-screen veil and `#ghost.inlive` the inline passage.
  createElement: (tag: string) => {
    const o: any = { ...el('__made__' + Math.random()), tagName: String(tag).toUpperCase(), className: '' };
    const has = () => String(o.className).split(/\s+/).filter(Boolean);
    o.classList = { contains: (c: string) => has().includes(c),
      add: (c: string) => { if (!has().includes(c)) o.className = [...has(), c].join(' '); },
      remove: (c: string) => { o.className = has().filter((x) => x !== c).join(' '); }, toggle() {} };
    return o;
  },
  createTextNode: (t: string) => ({ textContent: t }),
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
// THE VEIL'S ROLLER AND THE TYPEWRITER BOTH RUN ON FRAMES. Never called before 2026-09-02, because
// `ghost()`'s body was unreachable here — see the note on `append` in the element stub. A no-op
// scheduler rather than a real one: the checks in this file are about markup and state, not about
// what a glyph looks like fourteen frames in, and a live loop would run for the life of the suite.
(globalThis as any).requestAnimationFrame = () => 0;
(globalThis as any).cancelAnimationFrame = () => {};
// Kept, not swallowed, so a check can fire `popstate` the way the browser's Back does.
const winListeners: Record<string, Function[]> = {};
(globalThis as any).window = { addEventListener: (k: string, f: Function) => { (winListeners[k] ??= []).push(f); } };
(globalThis as any).location = { hash: '', pathname: '/' };
(globalThis as any).history = { replaceState() {}, pushState() {}, back() {}, state: null };
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
           chapterHero: true,
           // #55. Off, as every book is until its writer turns it on.
           weaving: false },
  weaves: false,
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
    // A PASSAGE IN THE CLOSED CHAPTER, added 2026-09-01. Every passage in this fixture used to sit
    // in `c-2`, the open one — so chapter c-1 was a heading with nothing under it, and issue #37's
    // checks ("reading mode draws every chapter") could not tell a real second chapter from an empty
    // one. Two of those assertions were vacuous against the old fixture and one of them was skipped
    // entirely by its own `if`. Proven by breaking the code three ways and watching only two go red.
    { id: 'p-0', ordinal: 0, body: 'Ashfall took the road in under a day.', author: 'model',
      speaker: null, isBreak: false, chapterId: 'c-1', variantIndex: 1,
      variants: [{ id: 'p-0', selected: true }] },
    // DIRECTED, since 2026-09-01: issue #38 opened the instruction a passage was written from (a
    // hold on Reweave does since 2026-10-29, and a tap reweaves), so
    // the fixture needs a passage that HAS one and others that do not — the press behaves
    // differently for each and a fixture where every passage is the same tests one branch.
    { id: 'p-1', ordinal: 1, body: 'The hall smells of cold iron. It was *too* quiet. "Stay," she said. **Now.**',
      author: 'model', speaker: null,
      directed: true, directive: 'have the envoy arrive early',
      isBreak: false, chapterId: 'c-2', variantIndex: 1, variants: [{ id: 'p-1', selected: true }] },
    { id: 'p-2', ordinal: 2, body: '"You came alone."', author: 'model', speaker: 'Envoy Sereth',
      mode: 'speak',
      isBreak: false, chapterId: 'c-2', variantIndex: 1, variants: [{ id: 'p-2', selected: true }] },
    { id: 'p-3', ordinal: 3, body: '"I came alone because."', author: 'human', speaker: null, mode: 'speak',
      isBreak: false, chapterId: 'c-2', variantIndex: 1, variants: [{ id: 'p-3', selected: true }] },
    // UNCLAIMED, added 2026-09-01. bugs.md #9: the server persists a generation at completion now, so
    // a passage can land while the browser is away. This is one of those — model-authored, real, and
    // not yet stood behind. Every other passage here omits `claimed`, which reads as claimed and is
    // what an older server sends.
    // `mode` ADDED 2026-09-01, and until then NO fixture passage carried one — so every `m-*` accent
    // class and every chip that names a press went untested, which is how Continue came to have no
    // mark down its margin at all. Two of them, on chapter c-2 because that is the one writing mode
    // draws: one mode cannot tell a per-mode class from a constant, and Continue is the press that
    // had nothing while Speak is one that always did.
    { id: 'p-4', ordinal: 4, body: 'The bell rang once and nobody came down for it.', author: 'model',
      speaker: null, claimed: false, mode: 'continue', isBreak: false, chapterId: 'c-2', variantIndex: 1,
      variants: [{ id: 'p-4', selected: true }] },
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
                  keys: ['home'], active: false }],
              // TWO OUTFITS, ONE WORN AND ONE NOT, added 2026-09-01. The chips carry their state in
              // a border colour and the label is the coat's name either way, so aria is the only
              // place it can live — and a card with no outfit made the check that proves it a
              // guarded block that never ran and reported green. One of each makes a constant
              // answer fail in both directions.
              outfits: [
                { id: 'o-worn', slot: 'outfit', name: 'Mourning grey', body: '[grey, unpinned]',
                  keys: [], active: true },
                { id: 'o-hung', slot: 'outfit', name: 'Travelling coat', body: '[oiled canvas]',
                  keys: [], active: false }] },
            { id: 'e-done', title: 'Coyle', body: '[a runner, dead]', entryType: 'character',
              activation: 'triggered', keys: ['Coyle'], lastEditor: 'human', states: [], notes: '',
              retiredAtChapter: 2, addons: [] },
            // A PLACE, and not only for variety: `pr-4` proposes a change to it, and until
            // 2026-09-01 nothing on screen read the card a proposal pointed AT — so the queue
            // rendered a change to a card the view did not hold and nothing noticed. The room
            // selector reads it, and a place's rooms are not a character's.
            { id: 'e-2', title: 'The stair', body: '[the lower stair: unlit]', entryType: 'lore',
              activation: 'triggered', keys: ['stair'], lastEditor: 'human', states: [], notes: '',
              addons: [] },
            // #36. THREE FACES, and the fixture has to carry all three or only one is drawn.
            // A card READ THROUGH from the book this one follows: `sharedFrom` set, no local row.
            { id: 'e-shared', title: 'The Ambersand', body: '[a house that lends at ruin]',
              entryType: 'lore', activation: 'always_on', keys: [], lastEditor: 'human', states: [],
              notes: '', addons: [], sharedFrom: 'The Ash Cycle', sharedFromId: 's-9' },
            // And one this book TOOK OVER: an ordinary card of its own that remembers the origin.
            { id: 'e-took', title: 'Vantic law', body: '[nobody descends without a writ]',
              entryType: 'lore', activation: 'always_on', keys: [], lastEditor: 'human', states: [],
              notes: '', addons: [], originId: 'e-origin' },
            /* THE TWO CARDS THAT CAN TELL THE TWO ANSWERS APART (2026-09-11). `In context` was
             * computed from activation and pins, which is a guess about what WILL fire rather than
             * a report of what did — and every card above agrees under both answers, so the fixture
             * could not have caught it. These two disagree, in opposite directions.
             * Triggered, and the manifest says its words appeared. The old rule says "not in". */
            /* `gaslamps` is a trigger word and NOTHING else — not in the title, the body or a
             * room. Every other key in this fixture repeats its card's name, so deleting keys from
             * the search left every assertion green. */
            { id: 'e-fired', title: 'The lamplighter', body: '[comes at six]',
              entryType: 'character', activation: 'triggered', keys: ['lamplighter', 'gaslamps'],
              lastEditor: 'human', states: [], notes: '', addons: [] },
            /* Always on, and the manifest says the canon ceiling threw it out. The old rule says
             * "in", for a card the model never saw. */
            { id: 'e-evicted', title: 'The Kesh Accord', body: '[signed under duress]',
              entryType: 'lore', activation: 'always_on', keys: [], lastEditor: 'human',
              states: [], notes: '', addons: [] }],
  follows: { id: 's-9', title: 'The Ash Cycle' },
  // WHICH THREADS HAVE A PICTURE. `e-1` does and `e-2` does not, so a view that draws one for every
  // card and a view that draws none both fail. `e-shared` has one too: a followed thread's picture
  // lives in the book the thread lives in, and the face here has to show it.
  entryImages: { 'e-1': 1788300000000, 'e-shared': 1788300111000 },
  // A thread taken OUT of this book: a tombstone, listed by name so it can come back.
  dropped: [{ id: 'e-stone', title: 'The Quay Office', originId: 'e-origin-2' }],
  pins: [], arcs: [],
  // Who writes this book. One row is a book written alone, which is what the composer reads to
  // decide whether Co-op is on the dial and what the Keep tab reads to offer a second writer.
  writers: [{ id: 'u-me', login: 'sonophage', owns: 1 }],
  turn: null,
  // What the engine computes in story.ts: the counts the shelf reads, and the stale summaries,
  // which are the part that can be waved away. The panel gates on this being present at all.
  waiting: { proposals: 2, strings: 1,
             stale: [{ id: 'c-1', index: 1, title: 'Ashfall', ref: 'hash-1' }] },
  // #94. The shape a server from before the contradiction check was deleted sent: one knot and one
  // never-sent knot on p-2, and a thread ignored for the scene. Kept so the page can be shown to draw
  // none of it — a fixture without them would pass whether or not the knot code was still there.
  violations: [{ id: 'v-1', passageId: 'p-2', entryId: 'e-1', quote: 'x', reason: 'gloves', confidence: 0.8 },
               { id: 'v-2', passageId: 'p-2', entryId: 'e-2', quote: 'y', reason: 'the stair',
                 confidence: 0.8, reached: false }],
  muted: ['e-1'],
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
  // The pair that separates "what the rule guesses" from "what was actually assembled" — see the
  // note beside them in the entries fixture. Both directions, or the check only ever sees agreement.
  { kind: 'CANON-TRIGGERED', id: 'e-fired', text: '', tokens: 120, state: 'included', reason: 'keyword', firedBy: ['lamplighter'] },
  { kind: 'CANON-ALWAYS', id: 'e-evicted', text: '', tokens: 300, state: 'omitted', reason: 'canon 45% ceiling' },
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
], totals: { budget: 46146, used: 27401, unallocated: 0 }, byKind: {}, overflowed: false }, prompt: '', exact: 21401,
  // Each sent thread's kind, as the route sends it for the library's hero (2026-11-02).
  kinds: { 'e-1': 'character', 'e-fired': 'character' } };

const POSTED: any[] = [];
// Every GET the app made, so a test can see which scene a press asked for.
const GOT: string[] = [];
// Which generations the stub actually served, so a test can assert that none ran.
const GENERATED: string[] = [];
// WHAT WAS ASKED FOR, AND HOW MANY AT ONCE. The second half is the point: the first version of the
// draw tray rendered four <img> tags and let the browser load them in parallel, and the free tier
// answers `429 Queue full for IP: 1 requests already queued (max: 1)` — one picture and three
// blank squares, which is exactly what Seth got. A count of requests would have passed. Only a
// count of CONCURRENT requests can fail.
const DRAWN: string[] = [];
let inFlight = 0, peakFlight = 0;
// Set by a test to make the Nth drawn request come back 429, so the refusal tile can be checked.
let refuseNth = 0;
// Set by a test to answer GET /api/stories with something other than the library below — an empty
// shelf, a sleeping router. Pressing the logo reloads the library, so a test can change what comes
// back and then ask for it. Null means "the fixture", which is every other test here.
let shelfOverride: any = null;
// Whether the canned model list says the server holds a Featherless key. Off, as it was before the
// field existed; a check that needs it on sets it and reads the list again.
let modelsRemote = false;
// Whether the library answer says this writer is the admin. Off: the fixture's writer is not. The
// model panel checks flip it to see the admin's view beside the writer's.
let libAdmin = false;
// Whether this writer is looking at the demo library. `POST /api/demo` sets it and the library answer
// carries it, the way the server does: the app reads `demo` back from the library on every reload.
let libDemo = false;
// #46. What `GET /api/after` names for delete-after's first press, and the passage it was asked about.
let afterYours: any[] = [];
let afterAsked: string | null = null;
// bugs.md #9. Which row the stubbed generation says it landed, or undefined for an older server that
// lands nothing and leaves the client to accept.
let stubPassageId: string | undefined = undefined;
// #55. When set, the stubbed stream holds its first line until this resolves: the stretch between
// the press and the first word, which is the whole of the time a weaving call spends planning.
let streamGate: Promise<void> | null = null, endGate: Promise<void> | null = null;
// #56. When set, the stubbed generation answers with this one line and no prose: a refusal.
let stubRefuse: any = null;
// #56. The same for a Talk reply and an invention, which are plain JSON calls.
let stubTalk: any = null, stubInvent: any = null, stubUndo: any = null;
// #100. The setup Talk's answer.
let stubSparkTalk: any = null;
// #111. A thread's history (Alterations), as `GET /api/history` answers it.
let stubHistory: any = null;
// #103. How many World lookups fail before one answers, as a dropped connection would.
let worldDown = 0;
(globalThis as any).fetch = async (url: string, init?: any) => {
  if (!init?.method || init.method === 'GET') GOT.push(url);
  if (init?.body) { try { POSTED.push({ url, body: JSON.parse(init.body), method: init.method }); } catch { /* not JSON */ } }
  /* A GENERATION, AS THE NDJSON STREAM THE REAL ROUTE SENDS. Until 2026-09-01 this stub answered
   * /api/generate with {}, so `res.body` was undefined and `jStream` threw on `getReader()` — which
   * meant no test in this file could press Continue or Regenerate at all. Issue #38's checks need to
   * press Regenerate and assert that nothing generates, and "nothing generates" cannot be told apart
   * from "generating crashes the suite" without this.
   *
   * One delta then the final line, which is exactly the shape serve.ts writes: `{d}` fragments and a
   * last object identical to what the non-streaming route returns. */
  if (url.startsWith('/api/generate') && init?.body?.includes('"stream":true')) {
    GENERATED.push(url);
    const lines = [JSON.stringify({ d: 'The hall answers. ' }),
                   JSON.stringify({ prose: 'The hall answers.', genId: 'g-stub', seconds: 1.1,
                                    // bugs.md #9. The real route lands the passage itself and reports
                                    // which row it is, so the page knows it was here for it. Set per
                                    // test rather than fixed: a constant here leaked into every other
                                    // block that drives a generation and marked their passage watched.
                                    ...(stubPassageId ? { passageId: stubPassageId } : {}),
                                    manifest: MANIFEST.manifest })];
    // In one read, unless a test is holding the stream: then the first word waits on `streamGate`
    // and the end of the call on `endGate`, so the stretch between them can be looked at too.
    const reads = stubRefuse ? [[JSON.stringify(stubRefuse)]] : streamGate ? [[lines[0]], [lines[1]]] : [lines];
    return { ok: true, status: 200, body: {
      getReader() {
        let i = 0;
        return { read: async () => {
          if (i >= reads.length) return { done: true };
          // Read at the moment of the read, so a test can close the end after the press.
          const gate = i === 0 ? streamGate : endGate;
          if (gate) await gate;
          return { done: false, value: new TextEncoder().encode(reads[i++].join('\n') + '\n') };
        } };
      },
    } } as any;
  }
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
  const body = url.startsWith('/api/stories') ? (shelfOverride ?? { stories: [{ id: 's-1', title: 'The Ashfall Concordat', status: 'in_progress', updatedAt: Date.now(), words: 9140, last: 'She left.',
        // LEFT OFF IN SCENE 3 OF 4 (2026-11-02), as after a hem opens the next scene empty: the hero
        // draws scene 3's threads and opens scene 3.
        last_chapter_id: 'c-3', last_chapter_idx: 3, last_chapter_title: 'The Inn', chapter_count: 4,
        // OWED SOMETHING, on purpose. What is waiting is drawn on the band now, which means it is
        // drawn for the hero book and nowhere else — so a hero owed nothing makes the chips
        // untestable, and the assertion would pass against a band that could never draw one.
        proposed: shelfOwes ? 2 : 0, unpaid: shelfOwes ? 1 : 0 },
      // Two of the three are owed something, and between them five separate things — so a shelf that
      // listed items would show five chips where it must show two.
      // #18 §5. One book pinned to a model the router no longer serves — the 2026-08-27 rename is
      // exactly this shape — and one pinned to a model it does, so the mark can be wrong in both
      // directions rather than only missing.
      { id: 's-2', title: 'The Salt Ledger', status: 'in_progress', updatedAt: 2, words: 400, last: 'He paid.',
        proposed: shelfOwes ? 3 : 0, unpaid: shelfOwes ? 1 : 0, model: 'write-nt-qwen36-h' },
      { id: 's-3', title: 'Sutera', status: 'draft', updatedAt: 1, words: 0, last: null,
        // unpaid: 2 since 2026-08-31, so the second book is on the strip and this tests grouping.
        // It has to WIN a kind, not merely have one: `waiting()` returns one row per kind naming the
        // book with the most of it, so a tie with The Salt Ledger's 1 would still name that book and
        // draw one chip.
        proposed: 0, unpaid: shelfOwes ? 2 : 0, model: 'Qwen3.6-WNTH-35B-A3B-NN' },
      // A FOURTH, PUT AWAY. Added 2026-08-31 with the archived section: the shelf splits live
      // books from archived ones under their own header, and with no archived book in the
      // fixture that split renders identically either way and the assertion below cannot fail.
      { id: 's-4', title: 'The Drowned Almanac', status: 'archived', updatedAt: 0, words: 60,
        last: 'It ended.', proposed: 0, unpaid: 0,
        // A BOOK SHARED WITH THIS WRITER, pinned by its owner to a remote model on the OWNER's
        // shortlist. This writer's model list never holds it; the row the server sends does.
        model: 'featherless:owner/Lent-Remote-24B', pin: { id: 'featherless:owner/Lent-Remote-24B',
          status: 'remote', source: 'remote', ready: true, ctxSize: 32768, perSlot: 32768 } },
      // A WORLD BOOK ON THE SHELF FIXTURE, added 2026-08-31 after one crashed the Threads page
      // in Seth's hands. storyCard assigned to a `const tags` for world books and threw, which
      // killed drawPage inside loadLedger and left the page reading "Reading the threads…" for
      // ever. Nothing in the suite had ever rendered a world-book card, so nothing could see it.
      // A LOOK OF ITS OWN, and as a STRING. `listStories` selects `s.*`, so the shelf gets the raw
      // `stories.look` column while `src/story.ts` hands the OPEN book a parsed object — an
      // asymmetry the banner has to cope with, and one an object here would hide completely.
      { id: 's-5', title: 'The Tessellate', status: 'in_progress', updatedAt: 5, words: 0,
        last: null, proposed: 0, unpaid: 0, is_world: 1, genre: 'fantasy',
        look: '{"theme":"scifi","font":"sans","size":"m","scale":"100"}' }], model: 'write-nt-qwen36-h', slot: SLOT, gen: STORY.gen,
      // The writer's default look rides the library call, which is the first thing asked for.
      look: { theme: 'romance', font: 'garamond', size: 'l', scale: '110' },
      // WHO IS ASKING, AND WHO ELSE IS HERE. Shaped exactly as the server sends it: `me` is an
      // account id, and a mate carries the login to send and the name to show — ANANSI_ALLOW maps a
      // tailnet address onto an account and only one of the two belongs on screen.
      me: 'u-me',
      mates: [{ login: 'hellrigelkc@gmail.com', name: 'kia' }] })
    : url.startsWith('/api/story') ? STORY
    // Moving a proposal answers with the VIEW, the way the accept path does — the client sets `V`
    // from it and repaints, which is how the room's buttons come back correct.
    : url === '/api/proposal/where' ? STORY
    // The chapter naming its own next chapter. Answered properly rather than with {}, because an
    // empty answer is a different case and it has its own guard.
    : url.startsWith('/api/chapter/propose') ? { chapterId: 'c-2', title: 'The Rust Year',
        note: 'By the end the debt has to be called in, and Marek has to be in the room for it.' }
    // #22. TWO BOOKS, because the page's whole job is grouping and collapsing — with one book
    // "exactly one open" is true however the collapse is written.
    : url.startsWith('/api/ledger') ? { slots: SLOTS, entries: [
        // `imageAt` and not `V.entryImages`: this page spans the shelf and `V` is one book. One
        // row with a picture and one without, for the same reason as above.
        { id: 'e-1', story: 's-1', storyTitle: 'The Ashfall Concordat', title: 'Halsey',
          body: 'A fence with a good coat and a better memory.', entryType: 'character',
          activation: 'always_on', keys: [], addons: [], outfits: [], imageAt: 1788300222000 },
        /* A ROOM WITH TEXT IN IT, added 2026-09-11. Every card here had `addons: []`, which is the
         * one shape that cannot fail the search: the cross-book box read title, body and keys and
         * looked correct against a fixture where the body was where the text was. In the live
         * library it is not — 464 of 483 cards keep their text in a room — so a fixture with no
         * rooms was testing the case that does not happen. */
        { id: 'e-2', story: 's-2', storyTitle: 'The Salt Ledger', title: 'the Ambersand',
          body: 'A house that lends at ruin.', entryType: 'lore',
          activation: 'triggered', keys: ['Ambersand'],
          // `usury` is the ROOM's own trigger word and appears nowhere else, for the same reason.
          addons: [{ id: 'a-amber', slot: 'facts', name: 'What it holds',
                     body: 'Nine floors of debt in ledgers nobody balances.',
                     keys: ['ledgers', 'usury'], active: true }], outfits: [] },
        // A card in the WORLD BOOK, so it has a group on the Threads page at all — the list is
        // grouped by book and built from entries, so a world book with no cards is not on it.
        { id: 'e-3', story: 's-5', storyTitle: 'The Tessellate', title: 'Ring Law',
          body: 'Nobody descends without a writ.', entryType: 'lore',
          activation: 'always_on', keys: [], addons: [], outfits: [] }] }
    // #25. The three-source shape `GET /api/models` actually returns: the router's status, the
    // preset file's context, and this database's measured speed. The third row is deliberately a
    // model the preset file does not mention and nobody has written with — the panel has to say
    // WHICH source is silent rather than print a dash, and a fixture where every field is filled
    // cannot see that at all. `active` stays the old alias so the rail's own assertions above
    // keep testing what they were written for.
    // THE WRITING RECORD, with a HOLE IN THE MIDDLE OF IT. `days` carries only the days that have
    // passages, so two rows nine days apart is exactly the shape that used to be drawn as two bars
    // side by side — an unbroken run. The page fills the gaps itself now and that is what these
    // dates are for; a fixture with consecutive days could not tell the two behaviours apart.
    : url.startsWith('/api/stats') ? (() => {
        const day = (back: number) => new Date(Date.now() - back * 86400000).toISOString().slice(0, 10);
        return { stories: 2, chapters: 3, entries: 17, passages: 17, words: 5199,
          yours: 6, anansi: 11, unchosen: 11, calls: 39, failed: 5, minutes: 8,
          tokensOut: 24120, medianSeconds: 10.4,
          kinds: [{ k: 'character', n: 9 }, { k: 'lore', n: 6 }, { k: 'item', n: 2 }],
          days: [{ d: day(9), n: 4, w: 1200 }, { d: day(1), n: 6, w: 2400 }] };
      })()
    : url.startsWith('/api/models') ? { active: 'write-nt-qwen36-h', allow: [], remote: modelsRemote, models: [
        { id: 'Qwen3.6-WNTH-35B-A3B-NN', status: 'loaded',
          ctxSize: 100096, parallel: 2, perSlot: 50048, tps: 58.4, runs: 58 },
        { id: 'Wayfarer-2-RPNT-12B', status: 'unloaded',
          ctxSize: 32768, parallel: 2, perSlot: 16384, tps: 41.2, runs: 3 },
        { id: 'Sorcerer-9-WNT-70B', status: 'unloaded' },
        // #53. A remote row, in the shape the route gives it: its status says where it runs, not
        // whether it is awake, because Featherless keeps no model asleep that a writer can see.
        { id: 'featherless:Grey/Kestrel-Heretic-24B', status: 'remote', source: 'remote',
          ctxSize: 32768, perSlot: 32768, cost: 2 }] }
    // #21. A skeleton, not a created story — which is the whole reason it lands on the page to be
    // edited before anything is written.
    : url.startsWith('/api/style') ? { style: 'Wet streets and short sentences.' }
    // #18 §3. The library rides beside the modes rather than inside them, which is the shape the
    // route returns: a saved voice is not a sixth mode and must never be drawn as one.
    // The Account page (2026-10-27). /api/me/avatar is an <img>, never fetched here.
    : url.startsWith('/api/me') ? { login: 'sonophage', name: 'Seth', avatar: null,
        featherless: { ready: false, file: '/home/x/.config/anansi/featherless-sonophage.key' } }
    : url.startsWith('/api/prompts') ? { defaults: { continue: 'Carry on.', speak: 'Say it.',
        act: 'Do it.', direct: 'Make it happen.', narrate: 'Write it.',
        reweave: '[A note from the writer on what did not work in the last version of this passage. '
          + 'That version is not shown. Avoid what the note describes: {{whatfailed}}]' },
        yours: {}, voice: { shipped: 'The shipped voice.', mine: null, inUse: 'The shipped voice.' },
        anansi: { shipped: 'Dry, brief.', mine: null, inUse: 'Dry, brief.' },
        library: { voice: [{ name: 'Noir', text: 'Wet streets. Nobody explains themselves.' }],
                   style: [] } }
    // #88. The cast, in the shape POST /api/spark/cast returns: the writer's character written from
    // outside with the yours pocket, another with pockets of her own, and a Rule.
    : url.startsWith('/api/spark/talk') ? (stubSparkTalk ?? { reply: 'Ask me anything.', seconds: 1 })
    // #103. The writer's own World for a new tale's IP, in the shape POST /api/spark/world returns:
    // one World, Elden Ring, matched as the server matches (trimmed, any case); nothing else.
    // #104. A new IP looked up, in the shape POST /api/spark/world/cast returns: Dune names a person
    // and a place with a line each, and one more when asked; Sunless Sea is from memory; Nowhere fails.
    : url.startsWith('/api/spark/world/cast') ? (() => {
        const b = JSON.parse(init?.body ?? '{}');
        const mem = b.world === 'Sunless Sea';
        return b.world === 'Nowhere' ? { error: 'search failed: no engines are up' }
          : b.more?.length ? { world: b.world, found: [{ name: 'Chani', kind: 'character', line: 'A Fremen of Sietch Tabr.' }] }
          : { world: b.world, ...(mem ? { memory: true } : {}), found: (mem
            ? [{ name: 'The Captain', kind: 'character', line: 'Runs a steamer on the Zee.' },
               { name: 'Fallen London', kind: 'place', line: 'The city under the earth.' }]
            : [{ name: 'Paul Atreides', kind: 'character', line: 'Heir of House Atreides.' },
               { name: 'Arrakis', kind: 'place', line: 'The desert planet.' }]).map((f) => mem ? { ...f, memory: true } : f) };
      })()
    : url.startsWith('/api/spark/world') && worldDown > 0 ? (worldDown--, { error: 'the server did not answer' })
    : url.startsWith('/api/spark/world')
      ? (String(JSON.parse(init?.body ?? '{}').name ?? '').trim().toLowerCase() === 'elden ring'
        ? { world: { id: 'w-ring', title: 'Elden Ring' },
            people: [{ title: 'Morgott', body: '[Morgott: the Omen King]' }] }
        : { world: null, people: [] })
    // #117 · Try it on's contradictions: both places, one fix each, of every part a fix can change.
    : url.startsWith('/api/spark/review') ? { changes: [], entries: [], contradictions: [
        { one: { thread: 'Teodor Ash', part: 'always_true', says: 'a clerk who counts the dead' },
          other: { thread: null, part: 'premise', says: 'Six houses have one winter' },
          fix: { thread: 'Teodor Ash', part: 'always_true', text: 'A clerk of House Marren who counts the dead.' },
          why: 'The premise has six houses, and Teodor belongs to none.', by: 'model' },
        { one: { thread: 'Teodor Ash', part: 'interiority', says: 'never says she is afraid' },
          other: { thread: 'Mara Voss', part: 'stands', says: 'on the road' },
          fix: { thread: 'Mara Voss', part: 'stands', text: 'Waits at the hall gate for Teodor.' },
          why: 'She cannot be on the road and at the gate.', by: 'model' },
        { one: { thread: null, part: 'premise', says: 'a peace none of them wants' },
          other: { thread: 'Ilva Marren', part: 'always_true', says: 'nothing to trade' },
          fix: { thread: null, part: 'premise', text: 'Six houses, and Ilva carries the seal.' },
          why: 'An envoy with nothing to trade cannot carry the seal.', by: 'model' },
        { one: { thread: 'Teodor Ash', part: 'voice', says: 'formal and short' },
          other: { thread: 'Teodor Ash', part: 'always_true', says: 'a clerk' },
          fix: { thread: 'Teodor Ash', part: 'voice', text: 'Formal, and he counts aloud.' },
          why: 'A clerk who counts speaks in numbers.', by: 'model' }] }
    : url.startsWith('/api/spark/cast') ? { entries: [
        { title: 'Mara Voss', entryType: 'character', activation: 'always_on', keys: ['Mara Voss'],
          body: '[Mara Voss: a courier who owes the envoy]',
          rooms: { appearance: { name: 'Road dust', body: 'Show the dust on her boots first.', on: true },
                   voice: { name: 'Their lines are yours', body: "Mara Voss's lines are the writer's.", on: true } } },
        { title: 'Teodor Ash', entryType: 'character', activation: 'always_on', keys: ['Teodor Ash'],
          body: '[Teodor Ash: a clerk who counts the dead]',
          rooms: { voice: { name: 'Envoy', body: 'Write her lines formal and short.', on: true },
                   interiority: { name: 'Fear', body: 'Never let her say she is afraid.', on: true } } },
        { title: 'Ring Law', entryType: 'item', activation: 'always_on', keys: ['writ'],
          body: '[Ring Law: nobody descends without a writ]',
          rooms: { what_it_does: { name: 'The fine', body: 'Show the fine paid in public.', on: true } } }] }
    : url.startsWith('/api/spark') ? { story: { title: 'The Winter Signature', genre: 'political fantasy',
        premise: 'Six houses have one winter to sign a peace none of them wants.',
        setting: 'Ashfall Hall', pov: 'third limited, past tense', spice: 2,
        writingStyle: 'Cold, spare.', persona: 'Ilva Marren',
        // #121. The moment the tale opens in, apart from the setting.
        opensWith: 'The east gallery, the first frost; snow on the leads, a grey morning.' },
        // #123. The Voice the spark wrote, offered beside the writer's own and never in the story.
        voiceOffer: 'Cold, spare. Long sentences, and the frost in every one.',
        entries: [{ title: 'Ilva Marren', entryType: 'character', body: 'A envoy with nothing to trade.' }],
        // ADR 0009. The open questions, beside the story and not in it.
        questions: [{ title: 'Who signs first', line: 'Each house waits for another to sign.' },
                    { title: 'What the envoy carries', line: 'Ilva has a sealed case nobody has opened.' }] }
    // #89. The end-scene route answers with the view at once; the passes run after it, and what
    // they report is on the scene's hem, not in this answer.
    : url.startsWith('/api/chapter/end') ? STORY
    : url.startsWith('/api/after?') ? (afterAsked = new URLSearchParams(url.split('?')[1]).get('id'),
        { yours: afterYours })
    : url.startsWith('/api/manifest') ? MANIFEST
    : url.startsWith('/api/settings') ? { gen: JSON.parse(init?.body ?? '{}') }
    : url.startsWith('/api/history') ? (stubHistory ?? {})
    : url.startsWith('/api/talk/undo') ? (stubUndo ?? { undone: "Put back Marek's Always true.", ...STORY })
    : url.startsWith('/api/talk') ? (stubTalk ?? { reply: 'It is about a debt.', seconds: 1, tokens: 10 })
    : url.startsWith('/api/invent') ? (stubInvent ?? { title: 'The Rust Choir', duplicate: false })
    : url === '/api/demo' ? (libDemo = !!JSON.parse(init?.body ?? '{}').on, { demo: libDemo })
    : url.startsWith('/api/activity') ? { runs: [{ id: 'g-1', role: 'prose', at: 1, error: null, promptTokens: 18904, completionTokens: 420, seconds: 5.9, prefillSeconds: 1.4, prefillRate: 38 }], worstPrefillSeconds: 2.8, failures: 0 }
    : {};
  return { ok: true, json: async () => ((libAdmin || libDemo) && url.startsWith('/api/stories') && body
    ? { ...body, ...(libAdmin ? { admin: true } : {}), ...(libDemo ? { demo: true } : {}) } : body) };
};

// THE VEIL, SWITCHED ON. Writing went inline on 2026-10-25 and the full-screen veil was kept behind
// `anansi.veil` so it can come back. Everything below about the veil tests that kept code, so the
// switch is on for this file; the inline default is tested in a browser, in test/ui/inline.js.
stored.set('anansi.veil', '1');
// This harness answers every id with a node, so `#ghost` always exists here and is the veil: the
// writing code tells the veil from the inline passage by its class.
(document as any).getElementById('ghost').classList.contains = (c: string) => c === 'veil';
await import('../web/app.js');
await sleep(30);   // let the boot IIFE settle

const html = (id: string) => String(nodes.get(id).innerHTML);

// Nothing may render the literal word "undefined" — that is what a wrong field name looks like
// on screen, and it is invisible to a syntax check.
for (const id of ['rail', 'bar', 'page']) {
  assert.ok(!/\bundefined\b/.test(html(id)), `#${id} rendered "undefined": ${html(id).match(/.{0,60}undefined.{0,40}/)?.[0]}`);
}
ok('the workspace boots with no undefined fields');

assert.match(html('rail'), /Library/);
// NO WAY TO A TALE'S MENU BEFORE A TALE HAS BEEN OPENED (2026-10-30): there is no tale for it to be.
assert.doesNotMatch(html('rail'), /class="railswap"/, 'SWAP-NONE: the main menu has no tale-menu icon before a tale is opened');
// The id is what the router answers to and what ANANSI_MODEL takes, so it stays — in the title,
// where it is one hover away instead of the first thing the rail says.
assert.match(html('rail'), /Write \u00b7 Qwen3\.6/, 'the rail names the model in words');
assert.match(html('rail'), /title="write-nt-qwen36-h"/, 'and keeps the id, one hover away');
{
  const { modelName, sceneName } = await import('../web/model.js');
  // A scene titled only by its number reads "Scene N", in every form Anansi has stored one; a
  // writer's own title is left as it is.
  for (const title of ['', 'Chapter 3', 'Scene 3', 'Chapter Three', 'chapter three'])
    assert.strictEqual(sceneName({ index: 3, title }), 'Scene 3', `SCENE-NAME: "${title}" reads as Scene 3`);
  assert.strictEqual(sceneName({ index: 3, title: 'Chapter One' }), 'Chapter One', 'SCENE-NAME: a number that is not its own is a title');
  assert.strictEqual(sceneName({ index: 3, title: 'The Bell' }), 'The Bell', "SCENE-NAME: the writer's title stays");
  // Weaving on this model means 900 tokens of plan and no prose at all — three runs of four. A
  // label that drops it is a label that hides the one setting that decides whether prose arrives.
  // The id's code says T or NT; the label says it in the writer's word (#49).
  assert.match(modelName('write-nt-qwen36-h').detail, /never plans/, 'MODEL-LABEL: nt reads as never plans');
  assert.match(modelName('agentic-t-qwen38-h').detail, /(?<!never )plans/, 'MODEL-LABEL: t must read as plans');
  assert.doesNotMatch(modelName('write-nt-qwen36-h').detail + modelName('agentic-t-qwen38-h').detail, /think/i,
    'MODEL-LABEL: and neither says thinking');
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
  assert.ok(modelName('GLM-4.7-Flash-RPTH-30B').bits.includes('plans'),
    'MODEL-LABEL: a T model must say it spins on every surface that shows the badges');
  assert.doesNotMatch(q.detail, /weav|think/,
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
  // A remote id is a Featherless repo path behind its prefix. The prefix is where it runs, not a
  // name — read as `repo:quant` it would show every remote model as "featherless".
  const fl = modelName('featherless:llmfan46/Qwen3.6-35B-A3B-uncensored-heretic');
  assert.strictEqual(fl.name, 'Qwen3.6 35B A3B uncensored heretic', 'a remote id decodes its repo path');
  assert.strictEqual(fl.id, 'featherless:llmfan46/Qwen3.6-35B-A3B-uncensored-heretic',
    'and keeps the stored id whole');
}
ok('a preset id in the 2026-08-27 convention decodes to purpose, weaving, decensoring and tier');

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

// #87 · THE VOICE AGAINST THE POINT OF VIEW. A Voice that names a person or a tense the tale's point
// of view does not tells the model two things (#81). Planted cases in both directions, and run against
// text it was not written for: the shipped Voice, under every point of view the screens offer.
{
  const { voiceClash, withoutClash } = await import('../web/model.js');
  const { DEFAULT_VOICE } = await import('../src/prompts.ts');
  const THIRD = 'third limited, past tense';
  const clash = 'Narrate in first person, present tense.';
  const v = `Short sentences. ${clash} Weather does the feeling.`;
  assert.deepStrictEqual(voiceClash(v, THIRD).map((c: any) => c.sentence), [clash],
    'VOICE-CLASH: a Voice that states another person and tense is named, that sentence only');
  assert.strictEqual(withoutClash(v, THIRD), 'Short sentences. Weather does the feeling.',
    'VOICE-FIX: the fix takes out that sentence and nothing else');
  assert.deepStrictEqual(voiceClash('You write in close third.', 'first person, present tense').length, 1,
    'VOICE-CLASH: close third against first person');
  assert.deepStrictEqual(voiceClash('Keep it in the present tense.', THIRD).length, 1,
    'VOICE-CLASH: a tense alone is enough');
  // A NEGATION SILENCES ITS OWN CLAUSE, NOT THE SENTENCE (review, 2026-10-27).
  assert.strictEqual(voiceClash('Use first person, never second person.', THIRD).length, 1,
    'VOICE-CLASH: a statement beside a forbidden person still counts');
  assert.strictEqual(voiceClash('Do not head-hop; stay in close third, past tense.', 'first person, present tense').length, 1,
    'VOICE-CLASH: a negation in one clause does not hide the next');
  assert.strictEqual(voiceClash('First person present tense with no filter words.', THIRD)[0]?.said, 'first person, present tense',
    'VOICE-CLASH: a negation hides only what follows it, not what it comes after');
  // AND WHERE IT MUST STAY QUIET.
  const quiet = [
    'Give her one line a scene, and let it be "you never listen".',          // "you" once, in dialogue
    'You are the narrator. You keep the sentences short.',                    // "you" is the model
    '"Write it in first person," the editor said, and nobody did.',           // a person named only inside quotes
    'Never slip into second person.',                                          // named to forbid it
    'Write in third person, with no filter words.',                            // a negation after an agreeing statement
    'Write in third person, past tense.',                                      // agrees
    'Describe what the point of view allows, and no more.',
  ];
  for (const q of quiet) assert.deepStrictEqual(voiceClash(q, THIRD), [], `VOICE-QUIET: "${q}"`);
  assert.strictEqual(withoutClash(quiet.join(' '), THIRD), quiet.join(' '), 'VOICE-FIX: and a quiet Voice is left byte for byte');
  const POVS = ['first person, present tense', 'first person, past tense', 'second person, present tense',
    'third limited, present tense', 'third limited, past tense', 'third omniscient, past tense'];
  for (const pov of POVS) assert.deepStrictEqual(voiceClash(DEFAULT_VOICE, pov), [], `VOICE-SHIPPED: the shipped Voice under ${pov}`);
  // A list Voice: the clashing line goes, its neighbours stay.
  const list = 'Craft:\n- Stay close.\n- Write in the second person.\n- One image a line.';
  assert.strictEqual(withoutClash(list, THIRD), 'Craft:\n- Stay close.\n- One image a line.', 'VOICE-FIX: a list item goes whole');
}
ok('a Voice that disagrees with the point of view is named, and the fix takes out only that sentence');

// Where it runs, in the writer's words. The slot size was here until 2026-10-24: a number for the
// person who runs the machine, on a screen both writers see.
assert.match(html('rail'), /on this machine/);
assert.doesNotMatch(html('rail'), /slot 50,048|llama-server/, 'and no machine numbers');
ok('the rail shows the workspace nav, the model and where it runs');

assert.match(html('page'), /The Ashfall Concordat/);
// ONE New story button, and it is the rail's — #19. It was on the page too, between the hero and
// the grid, and before that a dashed cell inside the grid taking a column from a book that exists.
// The page copy existed for one reason: the bar pill carried `deskonly` and a phone saw neither.
// Removing the page button alone would have shipped a phone with no way to start a book, so the
// pill lost `deskonly` in the same change and this asserts BOTH halves — the shelf has none, and
// the one that remains is not hidden on a narrow screen.
{
  const shelf = html('page');
  // THE BAND, NOT A HERO CARD. The newest book used to be a full-width `.storycard.hero` at 3/4 —
  // about a thousand pixels of cover on a laptop, with every other book under the fold and the one
  // thing you came back for, where you stopped, not on the screen at all. It is now a band that
  // carries the sentence you stopped on and one gold action. Since v3 (2026-10-25) it is the hero.
  assert.match(shelf, /<section class="resumeband/, 'the newest book gets the hero');
  assert.doesNotMatch(shelf, /storycard hero/,
    'and no hero card survives beside it — two answers to "which book" is one too many');
  // The band's job is the sentence. A band that renders with the chrome and no prose in it is the
  // old shelf wearing a new shape, and it would pass every structural check above.
  assert.match(shelf, /<button class="art" data-open="/, 'the band is the one door into the tale');
  assert.match(shelf, /Where you left off/, 'and says what it is showing you');
  assert.doesNotMatch(shelf, /data-open="new"/,
    'the shelf itself offers no New story button — the rail is the one door');
  assert.match(html('bar'), /<button class="pill(?: [^"]*)?" data-open="new"/,
    'and the bar pill is not deskonly, or a phone has no door at all');
}
ok('one New story button, on the bar, and the shelf does not repeat it');

// THE HERO'S THREADS (Seth, 2026-11-02: the banner's scene lines become "the cards that are currently
// active for that tale in the active scene", the bar under a tale's header). It asks the manifest for
// the last-worked scene, with no count, and draws the bar's segments: one per thread sent, coloured by
// kind, dimmed when a word woke it. And it is still one press.
{
  const { KIND_COLOR } = await import('../web/model.js');
  for (let i = 0; i < 40 && !POSTED.some((p) => p.url === '/api/manifest' && p.body.count === false); i++) await sleep(25);
  const ask = POSTED.find((p) => p.url === '/api/manifest' && p.body.count === false);
  assert.ok(ask, 'the hero asks for its threads without a count');
  assert.deepStrictEqual([ask.body.storyId, ask.body.chapterId], ['s-1', 'c-3'], 'for the last-worked scene');
  await sleep(40);
  const hero = html('page').match(/<section class="resumeband[\s\S]*?<\/section>/)?.[0] ?? '';
  assert.doesNotMatch(hero, /bandmeter/, 'no scene bars any more');
  const segs = [...(hero.match(/<span class="herosent"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? '').matchAll(/<i [^>]*>/g)].map((m) => m[0]);
  assert.strictEqual(segs.length, 2, 'one segment per thread sent, and not the one pushed out for room');
  assert.ok(/class="always"/.test(segs[0]) && /class="word"/.test(segs[1]), 'always on first and full, then the woken one dimmed');
  assert.ok(segs.every((x) => x.includes(KIND_COLOR.character)), 'coloured by kind, as the bar is');
  assert.strictEqual((hero.match(/<button/g) ?? []).length, 1, 'the hero is still one press');
  assert.match(hero, /<button class="art" data-open="s-1" data-chapter="c-3"/, 'and it opens the last-worked scene');
}
ok('the hero draws the threads sent in its last-worked scene, and opens that scene');

// ---- now open the story, which is where the field names bit ----
// The fake carries what `whileWorking` touches as well as the dataset, because a handler behind the
// in-flight guard reads its own button: `querySelector('.lbl-txt')`, `disabled`, `textContent`. It
// used to be `{ dataset }` alone, and `spark` joining that guard on 2026-08-30 turned this helper
// into a TypeError rather than an assertion — a harness too thin to drive the thing it is driving.
//
// EVERY LISTENER, NOT `[0]`, for the reason `typeIn` below gives about `input` — and it cost a red
// on 2026-09-02 to learn it twice. A second document-level `click` listener landed ABOVE the
// delegated action handler (a tap anywhere on the veil dismisses it), so `[0]` stopped being the
// handler this file exists to drive and `click({ open: 's-1' })` silently opened nothing. The
// failure surfaced thirty lines later as "the rail must switch to the story nav".
const click = (dataset: any) => (listeners.click ?? []).forEach((f: Function) => f({
  target: { closest: () => ({ dataset, querySelector: () => null, disabled: false, textContent: '', style: {} }) },
}));
// The same press with Alt held, which is a hold at a desk.
const altClick = (dataset: any) => (listeners.click ?? []).forEach((f: Function) => f({ altKey: true,
  target: { closest: () => ({ dataset, querySelector: () => null, disabled: false, textContent: '', style: {} }) },
}));
// A LONG PRESS ON A REWEAVE BUTTON, then the lift and the click the browser sends after it. A mouse
// pointer, so the tap synthesiser (which ignores mice) stays out of it. Past the hold's 450ms.
const holdRe = async (id: string) => {
  const b = { dataset: { re: id }, disabled: false };
  const target = { closest: (s: string) => (/\[data-re\]/.test(s) ? b : null) };
  (listeners.pointerdown ?? []).forEach((f: Function) => f({ target, clientX: 0, clientY: 0, pointerType: 'mouse' }));
  await sleep(520);
  (listeners.pointerup ?? []).forEach((f: Function) => f({ target, pointerType: 'mouse' }));
  click({ re: id });
  await sleep(40);
};
// Switching mode is a change on the dial now, not a click on one of four buttons — see the rail
// block below. `data-modesel` carries no value of its own; the chosen mode is the select's.
const pickMode = (mode: string) => (listeners.change ?? []).forEach((f: Function) =>
  f({ target: { dataset: { modesel: '' }, value: mode } }));
// Typing into a box the app watches by id. Two of them redraw only their own list rather than the
// page — the ledger's search and #20's thread picker — and that is the behaviour being checked.
//
// EVERY LISTENER, NOT `[0]`. This was `listeners.input?.[0]`, which silently means "whichever one
// app.js happens to register first". A second document-level `input` listener landed above the
// original on 2026-08-31 — the live readout beside a slider — and every typeIn in this file started
// dispatching to THAT one instead, so nothing typed reached the app at all and the failure surfaced
// four hundred lines away as `nodes.get('seeds')` being undefined. A harness that depends on
// registration order tests a different program every time someone adds a listener.
//
// ENOUGH OF AN ELEMENT TO BE THE COMPOSER. The target was `{ id, value }`, which is everything the
// panel and search listeners read — but `#input` has a listener of its own that records the
// composer's geometry on the first keystroke after focus, and it reads
// `getBoundingClientRect`, `scrollHeight`, `rows` and `style`. So `typeIn('input', ...)` threw
// where every other id passed. Same fields the element stub above carries, same arbitrary numbers.
const typeIn = (id: string, value: string) =>
  (listeners.input ?? []).forEach((f: Function) => f({
    target: { id, value, rows: 1, scrollHeight: 0, style: {},
              getBoundingClientRect: () => ({ top: 0, bottom: 0, height: 0 }) },
  }));
// THE HERO'S PRESS (2026-11-02): the tale opens at the last-worked scene, in one fetch, not two.
{
  const before = GOT.length;
  click({ open: 's-1', chapter: 'c-3' });
  for (let i = 0; i < 40 && !GOT.slice(before).some((u) => u.startsWith('/api/story?')); i++) await sleep(25);
  await sleep(40);
  assert.deepStrictEqual(GOT.slice(before).filter((u) => u.startsWith('/api/story?')),
    ['/api/story?story=s-1&chapter=c-3'], 'the hero opens the tale at that scene, in one fetch');
}
ok('the hero opens its tale at the last-worked scene');
click({ open: 's-1' });
await sleep(40);

for (const id of ['rail', 'bar', 'col', 'dockCol', 'sideBody']) {
  assert.ok(!/\bundefined\b/.test(html(id)), `#${id} rendered "undefined": ${html(id).match(/.{0,60}undefined.{0,40}/)?.[0]}`);
}
ok('the story surface renders with no undefined fields');

assert.match(html('rail'), /Storyteller/, 'the rail must switch to the story nav');
assert.match(html('rail'), /The Envoy/, 'and list chapters by title');
assert.ok(!/>Library</.test(html('rail')), 'and drop the workspace nav');
ok('the rail swaps navigation when a story opens');

// TWO menus, one rail, and which one is showing is no longer decided by where you are — the menu
// button asks for the workspace one from inside a story, the story's own name asks for the story
// one. Both directions asserted from inside an OPEN story, because that is the only place the two
// can disagree: outside one they are the same answer and a broken split still passes.
click({ railview: 'workspace' });
assert.match(html('rail'), /Library/,
  'the menu button must reach the workspace menu without leaving the story');
assert.ok(!/list chapters|Chapters/.test(html('rail')),
  'and the chapter list goes with it — it named a book you are no longer looking at');
click({ railview: 'story' });
assert.match(html('rail'), /Storyteller/, "the story's name must bring its own menu back");
assert.doesNotMatch(html('rail'), /class="railclose"/, 'with no close of its own at a desk: the header icon opens and shuts it (#133)');
ok('the menu and the story name are two doors onto one rail');

// Three layers of look, and the one that must never happen is a book's theme becoming yours.
{
  const root = (globalThis as any).document.documentElement;
  assert.strictEqual(root.dataset.uiTheme, 'ink', "the open book's own theme must be applied");
  // The book names ONLY a theme, so everything else has to come from the writer's default. A
  // book that pinned all four would pass this whatever the layering did.
  assert.strictEqual(root.dataset.uiFont, 'ebgaramond', "and the writer's font underneath it (saved as garamond, which FONT_WAS maps)");
  assert.strictEqual(root.dataset.uiSize, 'l', 'and their prose size');
  assert.strictEqual(root.dataset.uiScale, '110', 'and their UI scale');
  // The cache is of YOUR default, never of what is on screen. Caching the effective look is how
  // opening one green book makes every book green the next time the app starts.
  const cached = JSON.parse(stored.get('anansi.look') ?? '{}');
  assert.strictEqual(cached.theme, 'romance',
    `the browser cached "${cached.theme}" — that is the book's look, not the writer's default`);
}
ok("a book's look sits over the writer's, and never becomes it");

// The cover at the head of a chapter, when the book asks for it. Both states, because a plate that
// renders whatever the switch says is a switch that does nothing.
{
  const withPlate = html('col');
  assert.match(withPlate, /class="plate(?: [^"]*)?"/, 'the book asks for it, so the chapter carries the plate');
  assert.match(withPlate, /api\/cover\?story=s-1/, 'and the plate is the STORY cover, not a second image');
  // The title moves INTO the plate rather than being printed twice.
  const bandTitles = (withPlate.match(/class="serif band-title(?: [^"]*)?"/g) ?? []).length;
  assert.strictEqual(bandTitles, 0,
    'the chapter title belongs to the plate when there is one — printed in both is the same name twice');
  assert.match(withPlate, /class="serif plate-title(?: [^"]*)?"/, 'and it is on the plate');
}
ok('a chapter wears the book cover as its plate, and the title moves onto it');

// Or keeps it BEHIND the prose, which replaced the sticky heading. Drawn outside the scroller,
// because a sticky element cannot leave its own parent — inside #col it would scroll away with the
// chapter it exists not to scroll away with.
{
  STORY.story.chapterSticky = true;
  STORY.story.coverOpacity = 45;
  click({ open: 's-1' });
  await sleep(40);
  const back = html('backdrop');
  assert.ok(!nodes.get('backdrop').hidden, 'the backdrop shows when the book asks for it');
  assert.match(back, /api\/cover\?story=s-1/, 'and it is the story cover');
  assert.match(back, /opacity:0\.45/, "at the story's own strength, not a constant");
  // THE SLIDER MOVES THE GRADIENT, and the picture is not rebuilt on a repaint (2026-10-27).
  assert.match(back, /<u style="--reach:0\.214">/, 'the strength also sets how far the picture reaches');
  const drawn = nodes.get('backdrop').innerHTML;
  nodes.get('backdrop').innerHTML = drawn + '<!--kept-->';
  click({ panel: 'chapters' }); await sleep(20);
  assert.match(html('backdrop'), /<!--kept-->/, 'a repaint with nothing changed leaves the picture alone');
  (STORY.story as any).coverBlur = 6; STORY.story.coverFlip = true;
  click({ open: 's-1' }); await sleep(40);
  assert.doesNotMatch(html('backdrop'), /<!--kept-->/, 'a change to it does redraw it');
  assert.strictEqual(nodes.get('backdrop').className, 'blur flip', 'blurred and flipped when the tale asks');
  (STORY.story as any).coverFade = false;
  click({ open: 's-1' }); await sleep(40);
  assert.strictEqual(nodes.get('backdrop').className, 'blur flip nofade', 'COVER-FADE: and the fade can be off, leaving the blur alone');
  (STORY.story as any).coverFade = true;
  assert.match(html('backdrop'), /filter:blur\(6px\); inset:-12px/, 'by the amount the tale asks');
  (STORY.story as any).coverBlur = 0; STORY.story.coverFlip = false;
  // The plate and the backdrop are two treatments of one picture and must never both be on: the
  // cover would appear twice, once scrolling and once not.
  assert.doesNotMatch(html('col'), /class="plate(?: [^"]*)?"/,
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
  await sleep(40);
  assert.ok(nodes.get('backdrop').hidden, 'off again, the backdrop goes');
  assert.match(html('col'), /class="plate(?: [^"]*)?"/, 'and the plate comes back');
}
ok('a book can keep its cover behind the prose instead, at a strength it chooses');

// WAITING IS WHERE YOU ACT. It listed counts and sent you elsewhere, which is four journeys to
// answer "does anything want me" — the thing the panel exists to end. Every decision is taken in
// place now, using the SAME renderer as the panel each item came from.
{
  // `openStory` paints twice — it awaits the story, then the activity — so a panel chosen between
  // the two is repainted over by the second. Let it settle before choosing, and again before
  // reading, or this reads whichever panel that second paint left behind.
  await sleep(60);
  click({ panel: 'waiting' });
  await sleep(20);
  const w = html('sideBody');
  // Proposals: the card carries the editable box, because POST /api/proposal reads the BOX and not
  // the model's wording — a copy without it would quietly accept something else.
  // On the card's own foot (UX review, 2026-10-29: a card with one thread had Sew it in twice).
  assert.match(w, /data-deckall="accept" data-ids="pr-1"/, 'a proposal is accepted here');
  assert.match(w, /data-deckall="reject" data-ids="pr-1"/, 'or refused here');
  assert.match(w, /data-pbody=/, 'and what lands is the box, which is why the box has to be here');
  // Strings you already have are decided on the string, not dealt here (Seth, 2026-10-29: they kept
  // coming back after he put them in play). Their status presses live on the Strings screen.
  assert.doesNotMatch(w, /data-summon=|data-stringstatus=/, 'STRINGS-OFF-BENCH: no in-play or set-aside string is dealt here');
  // #94 · NO KNOTS. The contradiction check was deleted (Seth, 2026-10-28). The fixture still
  // carries `violations`, the shape a server from before the deletion sent, so a Workbench that
  // still drew them would show a knot card here.
  assert.doesNotMatch(w, /data-deckkind="knot"/, 'NO-KNOT-CARD: the Workbench deals no knot card');
  assert.doesNotMatch(w, /data-(dropflag|goflag|repair|mute|unmute)=/, '  and offers no Mend, Ignore or mute');
  // THE WAY BACK AND FORTH IS UNDER THE CARDS (Seth, 2026-10-27).
  const after = w.slice(w.lastIndexOf('data-deckcard='));
  assert.match(after, /class="decknav"[\s\S]*data-deckmove="-1"[\s\S]*data-deckmove="1"/, 'DECK-NAV: back and forward sit beneath the cards');
  assert.doesNotMatch(w.match(/<div class="deckhead">[\s\S]*?<\/div>/)![0], /data-deckmove/, '  and not in the head above them');
  // And it no longer sends you away to do any of it.
  assert.ok(!/data-panel="(chapter|strings|context)"/.test(w),
    'and nothing here is a link to somewhere else to do it');
}
ok('everything Waiting lists can be decided in Waiting');

// ---- ONE SEW IT IN PER CARD (UX review, 2026-10-29). A card with one thread had its thread's own
// Sew it in and ✕ inside it, and the card's ← Reject and Sew it in → under it: two pairs for one
// decision. The foot pair stays. A card with several threads keeps a pair per thread, because the
// foot can only take all of them or none. A pocket that is already there keeps Replace it, the one
// thing the foot cannot say.
{
  const cardOf = (side: string, id: string) => {
    const at = side.indexOf(`data-ids="${id}"`), from = side.lastIndexOf('data-deckcard=', at);
    return side.slice(from, at);
  };
  click({ panel: 'waiting' });
  await sleep(30);
  let side = html('sideBody');
  const one = cardOf(side, 'pr-1');
  assert.ok(one.includes('Witness rite'), 'ONE-SEW: the fixture deals pr-1 on a card of its own');
  assert.doesNotMatch(one, /data-decide=/, 'ONE-SEW: a card with one thread has no Sew it in or ✕ of its own inside it');
  const beside = cardOf(side, 'pr-3');
  assert.match(beside, /data-decide="replace" data-id="pr-3"/, '  and a pocket already there keeps Replace it');
  assert.doesNotMatch(beside, /data-decide="(accept|reject)"/, '  but not a second Sew it in or ✕');
  // THE STATE BOX STILL REACHES THE ROUTE from the foot, now that it is the only Sew it in.
  const doc = (globalThis as any).document, wasQS = doc.querySelector;
  doc.querySelector = (sel: string) => sel === '[data-pstate="pr-3"]' ? { checked: true }
    : sel === '[data-pchap="pr-3"]' ? { value: '4' } : wasQS?.call(doc, sel) ?? null;
  try {
    POSTED.length = 0;
    // The deck's handler names the card from the button's own `.deckcard`, which `click` cannot carry.
    const btn = { dataset: { deckall: 'accept', ids: 'pr-3' }, disabled: false, textContent: '', style: {},
      querySelector: () => null, closest: () => null };
    (listeners.click ?? []).forEach((f: Function) => f({ target: { closest: () => btn } }));
    await sleep(60);
    const took = POSTED.find((x) => String(x.url) === '/api/proposal');
    assert.strictEqual(took?.body?.asState, 4, 'ONE-SEW: the foot sends a change taken as a state, with its scene');
  } finally { doc.querySelector = wasQS; }
  // Several threads on one card: each keeps its own pair.
  const was = STORY.proposals;
  STORY.proposals = [{ ...was.find((p: any) => p.id === 'pr-1'), grp: 'g-1' },
    { ...was.find((p: any) => p.id === 'pr-5'), grp: 'g-1' }] as any;
  click({ open: 's-1' }); await sleep(40);
  click({ panel: 'waiting' }); await sleep(30);
  side = html('sideBody');
  for (const id of ['pr-1', 'pr-5']) {
    assert.match(side, new RegExp(`data-decide="accept" data-id="${id}"`), `ONE-SEW: on a card of two, ${id} keeps its own Sew it in`);
    assert.match(side, new RegExp(`data-decide="reject" data-id="${id}"`), `  and its own ✕`);
  }
  STORY.proposals = was;
  click({ open: 's-1' }); await sleep(40);
}
ok('a Workbench card with one thread has one Sew it in; a card of several keeps one per thread');

// Leaving takes the book's look off with it, or the shelf wears whichever book you opened last.
click({ leave: '1' });
await sleep(40);
{
  const root = (globalThis as any).document.documentElement;
  assert.strictEqual(root.dataset.uiTheme, 'romance', 'the shelf is back to the writer default');
  assert.strictEqual(root.dataset.uiFont, 'ebgaramond', 'with the rest of it unchanged');
}
ok('leaving a book takes its look with it');

// Back into the story, because everything below this reads the story surface.
click({ open: 's-1' });
await sleep(40);

assert.match(html('col'), /The hall smells of cold iron/);
// ACCENTED PROSE ON THE PAGE (2026-10-29): quotes, *emphasis* and **strong**, asterisks hidden, in a
// passage of narration and in a line of speech. The stored body keeps its asterisks (the fixture).
assert.ok(html('col').includes('<div class="narr" data-edit="p-1"><p>The hall smells of cold iron. It was <em>too</em> quiet.</p>'
  + '<p><span class="q">&quot;Stay,&quot;</span> she said. <strong>Now.</strong></p></div>'), 'ACCENT-PAGE: narration is accented');
assert.ok(html('col').includes('<div class="said" data-edit="p-2"><span class="q">&quot;You came alone.&quot;</span></div>'),
  'ACCENT-PAGE: and so is a line of speech');
assert.match(html('col'), /Envoy Sereth/, 'a speaker label must render');
assert.match(html('col'), /You · Ilva Marren/, 'a human passage must be attributed to the persona');
// THE CLASS TOKEN, not the whole attribute. This read `class="block speak"` exactly, so it went red
// the moment that passage also carried a mode accent — a true statement about the markup breaking on
// an unrelated addition. `\b` on both sides, or `speak` would also match `m-speak`.
assert.match(html('col'), /class="[^"]*\bspeak\b[^"]*"/, 'quoted prose is a speech block');
// Regenerate and Continue live at the END of the page now, on the passage they act on. The count
// is the assertion that matters: `newest` is passed per passage, so a renderer that stopped
// distinguishing them would put a pair of buttons under every paragraph and still "have" them.
{
  // The ⋯ handle is gone; a double click is the only way into the tray now.
  assert.doesNotMatch(html('col'), /class="more(?: [^"]*)?"|data-more/,
    'the three-dot handle must be gone — a double tap opens the tray and has since F34');
  assert.match(html('col'), /class="acts(?: [^"]*)?"/, 'but the tray itself is still rendered');
  // Reading mode keeps the tray and loses everything in it that writes. The marker is what CSS
  // hides, so it is asserted here rather than left to a stylesheet nobody reads.
  const tray = html('col').match(/<div class="acts(?: [^"]*)?">[\s\S]*?<\/div>/)?.[0] ?? '';
  assert.match(tray, /class="wr(?: [^"]*)?" data-ed/, 'Edit is marked as writing, so reading mode drops it');
  assert.match(tray, /data-fork/, 'Branch is not, so reading mode keeps it');
  assert.match(tray, /class="readonly(?: [^"]*)?" *|data-chapters/, 'and the chapter list is reading-mode only');

  const carries = html('col').match(/class="carry(?: [^"]*)?"/g) ?? [];
  assert.strictEqual(carries.length, 1,
    `the line under the last passage belongs to the last passage only — found ${carries.length} rows`);
  // #71. Reweave and Continue moved down to the three buttons at the foot of the screen, and are
  // asserted in both places: gone from under the passage, there on the bar, naming the LAST passage.
  const carry = html('col').match(/<div class="carry(?: [^"]*)?">[\s\S]*?<\/div>/)?.[0] ?? '';
  assert.doesNotMatch(carry, /data-re=|data-continue/, 'Reweave and Continue are no longer under the passage');
  // Round two: the bulb for Anansi's ideas is where the tap hint is, under the last passage.
  assert.match(carry, /class="bulb(?: [^"]*)?" data-idea="1"/, 'the bulb for Anansi\'s ideas is under the last passage');
  const bar = html('dockCol').match(/<div id="nextbar">[\s\S]*$/)?.[0] ?? '';
  assert.match(bar, /data-re="p-5"/, 'the bar\'s Reweave must name the LAST passage, not the first');
  assert.match(bar, /data-dockopen="1"/, 'the quill that opens the box is beside it');
  assert.match(bar, /data-continue="1"/, 'and ✦, Continue, beside that');
  assert.doesNotMatch(bar, /data-idea/, 'and the ideas are no longer on the bar');
}
ok('↻, the quill and ✦ sit on the bar at the foot of the screen, and the bulb under the last passage');

// ---- ✦ · ONE IDEA PER MODE, PICKED INTO ITS OWN MODE (Seth, 2026-10-30: "themed to our actions, one
// direction each for something that can be said, narrated, spoken or acted").
{
  const canned = (globalThis as any).fetch;
  const IDEAS = [{ mode: 'speak', text: '"You kept my page."' }, { mode: 'act', text: 'She tears the page out.' },
    { mode: 'direct', text: 'The lamps go out on the lower stair.' }, { mode: 'narrate', text: 'The rain came in after them.' }];
  (globalThis as any).fetch = async (url: string, init?: any) => url === '/api/idea'
    ? { ok: true, status: 200, json: async () => ({ ideas: IDEAS }), text: async () => JSON.stringify({ ideas: IDEAS }) } : canned(url, init);
  try {
    click({ idea: '1' }); await sleep(40);
    const col = html('col');
    assert.deepStrictEqual([...col.matchAll(/class="idea m-(\w+)" data-ideapick="\d"><span class="ideamode"\s*>(\w+)</g)].map((m) => `${m[1]}:${m[2]}`),
      ['speak:Speak', 'act:Act', 'direct:Direct', 'narrate:Narrate'], 'IDEA-PER-MODE: four ideas, each named and edged by its mode');
    const box = nodes.get('input'), wasDispatch = box.dispatchEvent, wasValue = box.value;
    const wasMode = html('dockCol').match(/<option value="(\w+)" selected>/)?.[1] ?? 'speak';
    box.dispatchEvent = () => true; box.value = '';
    click({ ideapick: '0' }); await sleep(20);
    assert.strictEqual(nodes.get('input').value, '"You kept my page."', 'IDEA-PICK: the picked idea goes in the box');
    assert.match(html('dockCol'), /<option value="speak" selected>/, 'IDEA-PICK-MODE: in its own mode, Speak');
    box.dispatchEvent = wasDispatch; box.value = wasValue; pickMode(wasMode);
  } finally { (globalThis as any).fetch = canned; }
  ok('✦ shows an idea per mode, and the one picked goes in the box in its own mode');
}

assert.match(html('col'), /class="block you(?: [^"]*)?"/, 'the writer\'s own line is a you block');

/* ---- WHERE EACH PASSAGE CAME FROM, said in words as well as in a colour.
 *
 * Seth, 2026-09-01: "the lines beside the text the accented ones are 2px too thin its hard to
 * differentiate could we also add a chip at the top that says where it came from." Two halves of one
 * answer — the rule is 3px now and the chip names the press — so the chip carries the rule's own
 * colour and neither needs a legend.
 *
 * THE PRESS, NOT THE AUTHOR, wherever a mode was recorded: authorship cannot separate Act from
 * Narrate, because both write a bare human row. The fixture has one of each shape. */
{
  const col = html('col');
  const chips = [...col.matchAll(/<div class="from(?: [^"]*)?"><i><\/i>([^<]*)</g)].map((m) => m[1].trim());
  assert.strictEqual(chips.length, (col.match(/class="block/g) ?? []).length,
    'every passage says where it came from, not just the ones with a mode');
  // AT THE TOP OF ITS BLOCK, which is what was asked for — before the prose, not under it.
  const one = col.slice(col.indexOf('class="block'));
  assert.ok(one.indexOf('class="from"') < one.indexOf('data-edit='),
    'the chip comes before the words it is about');
  // WOVEN (Seth, 2026-10-29): what the model wrote is not an action, so it is not labelled or
  // coloured as one. Every model passage says Woven, whatever press asked for it, with its own bar.
  for (const id of ['p-1', 'p-2']) {
    const b = col.slice(col.lastIndexOf('<div class="block', col.indexOf(`data-edit="${id}"`)));
    assert.match(b, /^<div class="block[^"]*\bm-woven\b/, `WOVEN-BAR: ${id}, written by the model, wears the Woven bar`);
    assert.doesNotMatch(b.slice(0, b.indexOf('>')), /\bm-(speak|act|direct|narrate|continue|coop)\b/,
      `  and no action's accent (${id})`);
  }
  assert.ok(!/class="block[^"]*\bm-continue\b/.test(col), 'WOVEN-NOT-CONTINUE: a passage Continue asked for is Woven, not Continue');
  assert.ok(chips.includes('Woven'), `WOVEN-CHIP: its chip says Woven — got ${JSON.stringify(chips)}`);
  assert.ok(!chips.includes('Continue') && !chips.some((c) => /^Direct/.test(c)), '  and never the action that asked for it');
  // THE WRITER'S OWN PASSAGES keep their press: p-3 is a line the writer spoke.
  assert.ok(chips.some((c) => /^Speak/.test(c)), `a passage the writer wrote names its press — got ${JSON.stringify(chips)}`);
  // AND A SPOKEN LINE CARRIES WHO SAID IT, which is the one thing the colour cannot say.
  assert.match(col, /<div class="from(?: [^"]*)?"><i><\/i>Woven &middot; Envoy Sereth</,
    'a line the model voiced for someone names them on the chip');
  // THE SPEAK ACTION IS IN THE SPEECH HIGHLIGHT (Seth, 2026-10-29): the writer's spoken line reads in
  // the colour quoted speech has in the prose.
  assert.match(col, /class="said spoke" data-edit="p-3"/, 'SPEAK-HIGHLIGHT: the line the writer spoke is drawn in the speech highlight');
  assert.doesNotMatch(col, /class="said spoke" data-edit="p-2"/, '  and a line the model voiced is not');
}
ok('every passage carries a chip saying where it came from, above the prose');
// #94 · NO KNOT ROWS IN THE PROSE. The fixture's two violations are on p-2; a page that still drew
// them would put a red row and its actions under that passage.
{
  const col = html('col');
  assert.doesNotMatch(col, /Knot ·|Never sent ·|class="flag"|class="flagacts/, 'NO-KNOT-ROW: no knot row sits on a passage');
  assert.doesNotMatch(col, /data-(flagx|dropflag|repair|mute)=/, '  and no Mend, Ignore or mute press');
}
ok('the prose carries no knot rows (#94)');
// Act and Narrate write HUMAN passages that are narration, not dialogue. Before the mode set,
// author === 'human' was a safe proxy for "this is a line of speech", because Speak was the only
// way to write one — so the renderer keyed off authorship. It is not a proxy any more, and
// rendering a paragraph of your own narration as dialogue under a "You ·" chip is the opposite
// of what Narrate is for.
assert.match(html('col'), /class="narr"[^>]*data-edit="p-4"/,
  'a human passage that is not dialogue must render as narration, not as your speech');
assert.ok(!/You · Ilva Marren<\/div>\s*<div class="said(?: [^"]*)?" contenteditable="plaintext-only" data-edit="p-4"/.test(html('col')),
  'and must carry no "You ·" chip');
// Speaking AS someone else labels it with their name, not with yours.
assert.match(html('col'), /Envoy Sereth<\/div>\s*<div class="said"[^>]*data-edit="p-5"/,
  'a human line spoken as another character is labelled with that character');
ok('prose renders as narration, speech, the writer\'s own line, and a flag');

// The four modes are options on one dial since 2026-09-02. They read Speaking As and Acting As
// until 2026-10-24, when "You play" became the one phrase for who you speak as; the dial now
// carries the MODES labels and the name beside it is labelled You play.
for (const label of ['Speak', 'Act', 'Direct', 'Narrate']) {
  assert.match(html('dockCol'), new RegExp(`>${label}<`), `the composer must offer ${label}`);
}
// SEND STAYS SEND. It carried two jobs for as long as Stop had nowhere else to be. Stop lives on
// the veil now — which covers the whole screen and is the only thing visible while he writes — so
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
// #71. It is back at the bottom, on the bar of three buttons, and still not in the mode row.
assert.doesNotMatch(html('dockCol').match(/<div id="modes">[\s\S]*?<div id="inputRow">/)?.[0] ?? 'no modes row',
  /data-continue/, 'Continue is not a chip in the mode row');
assert.doesNotMatch(html('dockCol'), /data-mode="continue"/, 'and it was never a selectable mode');
// The hint names the thing you type and puts the persona in it — Seth, 2026-09-02: "the help hints
// in the input box should be rewritten so they make sense". It read "Say it as Ilva Marren", which
// is what the dial says now, and Act's read "What Ilva Marren do".
assert.match(html('dockCol'), /The words Ilva Marren says/,
  'the placeholder follows the mode and the persona, and is grammatical with a name in it');
// ONE DIAL, NOT FOUR BUTTONS, since 2026-09-02 — Seth: "make speak, act, direct and narrate into
// a drop down. the selection should look like a button." Asserted as one select carrying all four
// AND as the absence of the buttons: putting the dial in without taking the rail out is the shape
// that ships both, and only the pair can catch it.
const dial = () => html('dockCol').match(/<select class="dial(?: [^"]*)?" data-modesel[\s\S]*?<\/select>/)?.[0] ?? '';
assert.ok(dial(), 'the rail must carry the mode dial');
for (const k of ['speak', 'act', 'direct', 'narrate'])
  assert.match(dial(), new RegExp(`value="${k}"`), `${k} must be an option on the dial`);
assert.doesNotMatch(html('dockCol'), /data-mode="/,
  'and the four mode buttons are gone — one control, not five');
assert.match(dial(), /value="speak"[^>]*selected/, 'the mode being drawn is the one selected');
// SPEAK, ACT, AND YOU PLAY (2026-10-24). The two modes that take a name keep their own labels, the
// old "Speaking As" and "Acting As" are gone, and the name beside the dial says You play.
assert.match(dial(), />Speak</, 'Speak reads "Speak" on the dial');
assert.match(dial(), />Act</, 'and Act reads "Act"');
assert.doesNotMatch(html('dockCol'), /Speaking As|Acting As/, 'and neither old label is left');
assert.match(html('dockCol'), /class="playlbl"[^>]*>You play</, 'the name beside the dial is labelled You play');
// TITLE CASE ON EVERY LABEL, all four and both doors — Seth, 2026-09-02: "all the labels should be
// Camel Cased for uniformity." A lower-case option beside three capitalised ones is the state this
// catches, and it is the state the dial shipped in for an hour.
// (The two thread doors left the rail in #71's second round; see below.)
for (const l of ['Speak', 'Act', 'Direct', 'Narrate'])
  assert.match(html('dockCol'), new RegExp(`>${l}<`), `${l} must be Title Case on the rail`);
// AND DIRECT AND NARRATE KEEP THE TABLE'S OWN LABELS, which is what says the dial spells the two
// out rather than the MODES table doing it — the same table names the chip over a passage, and
// "speaking as" over a paragraph is not English.
assert.match(dial(), />Direct</, 'Direct is still just Direct');
assert.match(dial(), />Narrate</, 'and Narrate still Narrate');

// WHO you are speaking as is IN the rail now, beside the dial. It was #asRow, a strip of its own
// above the rail, from 2026-08-27 to 2026-09-02: it went up there because at the end of a rail of
// seven controls it was cramped, and the rail has two. Both halves asserted — in the rail, and no
// strip left behind.
assert.match(html('dockCol'), /id="asWhom"/, 'Speak must offer who you are speaking as');
assert.match(html('dockCol'), /Ilva Marren/, 'defaulting to the point-of-view character');
// (That the strip itself is gone is asserted against app.html in the CSS block below: this
//  harness makes a node for any id that is asked for, so getElementById cannot say it.)
// Direct and Narrate have no speaker: an instruction is not spoken by anyone, and Narrate is your
// own prose. The select must be ABSENT for them, not merely hidden — one left in the DOM is one a
// presence check finds and a keyboard reaches.
pickMode('direct');
assert.doesNotMatch(html('dockCol'), /asWhom/, 'Direct must carry no speaker control at all');
pickMode('narrate');
assert.doesNotMatch(html('dockCol'), /asWhom/, 'nor Narrate');
pickMode('speak');
assert.match(html('dockCol'), /id="asWhom"/, 'and Speak brings it back');

// THE YOU PLAY PICKER (Seth, 2026-11-02: "only active cards up top, and then the rest below it with a
// search function"). It was a select of every character. Now a press opens a picker: search first,
// then you and the characters sent in this scene, then the rest. In the fixture Envoy Sereth is sent
// always, the lamplighter is woken by a word, and Coyle is not sent.
{
  assert.match(html('dockCol'), /<button[^>]*id="asWhom"[^>]*>[^<]*Ilva Marren/, 'who you play is a button naming them');
  click({ playpick: '1' });
  await sleep(20);
  const pick = html('dockCol').match(/<div id="playpick"[\s\S]*$/)?.[0] ?? '';
  const rows = (h: string) => [...h.matchAll(/data-play="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(pick.includes('id="playq"') && pick.indexOf('id="playq"') < pick.indexOf('data-play='), 'the search is first');
  assert.deepStrictEqual(rows(pick), ['', 'Envoy Sereth', 'The lamplighter', 'Coyle'],
    'you, then the characters sent in this scene, then the rest');
  assert.ok(pick.indexOf('In this scene') < pick.indexOf('data-play=""')
    && pick.indexOf('data-play="The lamplighter"') < pick.indexOf('Everyone else')
    && pick.indexOf('Everyone else') < pick.indexOf('data-play="Coyle"'), 'under two headings');
  assert.match(pick, /data-play=""[^>]*aria-current="true"/, 'who you play now is marked');
  typeIn('playq', 'coy');
  await sleep(10);
  assert.deepStrictEqual(rows(html('playlist')), ['Coyle'], 'typing narrows both groups');
  typeIn('playq', 'zzz');
  await sleep(10);
  assert.match(html('playlist'), /No one by that name/, 'and says so when nobody matches');
  const before = POSTED.length;
  click({ play: 'Envoy Sereth' });
  await sleep(30);
  assert.doesNotMatch(html('dockCol'), /id="playpick"/, 'a pick closes the picker');
  assert.match(html('dockCol'), /<button[^>]*id="asWhom"[^>]*>[^<]*Envoy Sereth/, 'and the button names who you play now');
  assert.ok(POSTED.slice(before).some((p) => p.url === '/api/manifest' && p.body.speaker === 'Envoy Sereth'),
    'and the next call is built as them');
  click({ playpick: '1' });
  await sleep(20);
  assert.doesNotMatch(html('dockCol'), /value="zzz"/, 'a picker opened again starts with an empty search');
  click({ play: '' });
  await sleep(30);
  assert.match(html('dockCol'), /<button[^>]*id="asWhom"[^>]*>[^<]*Ilva Marren/, 'and picking you goes back to you');
}
ok('You play is a picker: search first, then who is in this scene, then everyone else');

// ANY PANEL, FULL SCREEN (Seth, 2026-11-02: "all the panels can be full screen especially threads").
// A button in the panel's head spreads it over the page, the layout the hem has had since 2026-10-30,
// and the same press puts it back. Per panel, and this device remembers it.
{
  const rootEl = (globalThis as any).document.documentElement;
  const store = (globalThis as any).localStorage;
  click({ panel: 'threads' }); await sleep(20);
  assert.strictEqual(rootEl.dataset.sidefull, '0', 'a panel opens beside the page');
  assert.match(html('sideHead'), /data-panelfull="1"[^>]*aria-pressed="false"/, 'its head carries the full-screen press');
  click({ panelfull: '1' }); await sleep(20);
  assert.strictEqual(rootEl.dataset.sidefull, '1', 'the press spreads it over the page');
  assert.match(html('sideHead'), /data-panelfull="1"[^>]*aria-pressed="true"/, 'and says so');
  assert.ok(JSON.parse(store.getItem('anansi.panelfull') ?? '[]').includes('threads'), 'and this device remembers it');
  click({ panel: 'strings' }); await sleep(20);
  assert.strictEqual(rootEl.dataset.sidefull, '0', 'per panel: another opens beside the page');
  click({ panel: 'threads' }); await sleep(20);
  assert.strictEqual(rootEl.dataset.sidefull, '1', 'and Threads comes back full');
  click({ entry: 'e-1' }); await sleep(20);
  assert.strictEqual(rootEl.dataset.sidefull, '1', 'a thread read from it stays full');
  assert.match(html('sideHead'), /data-panelfull="1"/, 'with the press in its head too');
  click({ backentry: '1' }); await sleep(20);
  click({ panelfull: '1' }); await sleep(20);
  assert.strictEqual(rootEl.dataset.sidefull, '0', 'the same press puts it back beside the page');
  assert.ok(!JSON.parse(store.getItem('anansi.panelfull') ?? '[]').includes('threads'), 'and the device forgets it');
  click({ panel: '' }); await sleep(20);
}
ok('any panel can be full screen, per panel, remembered on this device');
// The tint follows the mode, and it follows it on the ROOT — which means the attribute has to be
// rewritten by the thing that draws the row. Written in applyLook it went stale the moment you
// pressed a different mode, and Act kept its tinted, rounded background after you had left it.
{
  const rootEl = (globalThis as any).document.documentElement;
  assert.strictEqual(rootEl.dataset.uiMode, 'speak', 'the root carries the mode being drawn');
  pickMode('act');
  assert.strictEqual(rootEl.dataset.uiMode, 'act', 'and it changes with it');
  pickMode('direct');
  assert.strictEqual(rootEl.dataset.uiMode, 'direct',
    'including to a mode with no tint at all — otherwise the last tinted button keeps its lift');
  pickMode('speak');
}
{
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
  // IT HAS TO LOOK LIKE A BUTTON, which is the whole of Seth's instruction about it, and a native
  // select does not: `appearance:none` and a border of its own are what make it one. Without them
  // the rail carries the platform's own grey control, which is the one outcome this change cannot
  // have. The two checks that used to sit here — no background on a selected mode button, no tint
  // on the speaker strip — were about elements that no longer exist, and a check that cannot fire
  // reports perfection.
  const dialCss = css.match(/#modes select\.dial \{[^}]*\}/)?.[0] ?? '';
  assert.ok(dialCss, 'the dial must be styled at all');
  assert.match(dialCss, /border:/, 'the dial carries a border — it is meant to read as a button');
  assert.match(css, /#modes select\.dial[^{]*\{[^}]*appearance:none/,
    'and the platform control is taken away, or the border sits behind a native widget');
  assert.ok(!/-tint\b/.test(css), 'and the speaker strip\'s tokens are still gone, not left unused');
  // THE STRIP IS GONE FROM THE PAGE, not merely left empty. It carried the name for six days above
  // the rail; the name is in the rail now, and an element nothing writes to is one the next reader
  // has to work out is dead.
  assert.ok(!/id="asRow"/.test(css), 'the #asRow strip is out of the document');
  assert.ok(!/#asRow/.test(css), 'and its rules went with it');
}
// THE THREADS DIAL LEFT THE RAIL in #71's second round (Seth, 2026-10-25): the tale's title in the
// header opens this tale's Threads, and Add is the plus at the top of that list. Asserted both ways,
// gone from here and there in the header, because only the pair fails when it is in both or neither.
const modeRow = html('dockCol').match(/<div id="modes">[\s\S]*?<div id="inputRow">/)?.[0] ?? '';
assert.ok(modeRow, 'the mode row must exist');
assert.doesNotMatch(modeRow, /data-threadsel|data-goblock="threads:"|data-newlore/,
  'the threads dial is gone from above the box');
assert.match(html('bar'), /<button data-goblock="threads:" aria-label="This tale's threads"/,
  'and the tale\'s title in the header opens this tale\'s threads');
assert.match(html('bar'), /data-railview="story" data-railhead="1" class="pill(?: [^"]*)?" aria-label="This tale's menu"/,
  'while the ⋯ still opens the tale\'s menu');
ok('the composer offers one mode dial and the name beside it, and the title opens the threads');

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
  const { KIND_COLOR } = await import('../web/model.js');
  // THE BAR IS THE THREADS SENT NOW (Seth, 2026-11-01), not the scenes: one segment per thread the
  // manifest holds, coloured by its kind, a word-woken one dimmed. The fixture sends Envoy Sereth
  // always and the lamplighter on a word, and evicted one; the evicted one is not on the bar.
  const segs = [...html('ctxbar').matchAll(/<i class="([^"]*)" data-sentkind="([^"]*)" style="background:([^"]*)"><\/i>/g)]
    .map((m) => ({ how: m[1], kind: m[2], bg: m[3] }));
  assert.deepStrictEqual(segs.map((x) => x.how), ['always', 'word'],
    `BAR-THREADS: one segment per thread sent, always on first, the evicted one left off (${JSON.stringify(segs)})`);
  assert.ok(segs.every((x) => x.kind === 'character' && x.bg === KIND_COLOR.character), 'BAR-KIND: each in its kind\'s colour');
  {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
    assert.match(css, /#ctxbar i\.word \{[^}]*opacity:\s*\.4/, 'BAR-DIM: one woken by a word is dimmed');
  }
  // AND THE PERCENTAGE IS NOT IN IT. The bar was a single `<i>` filled to the context percentage,
  // and this is what goes red if that comes back — the number belongs in the reading, in words.
  assert.ok(!/width:/.test(html('ctxbar')),
    'the bar no longer fills to a percentage; the context number lives in the reading');
  assert.ok(!nodes.get('ctxbar').hidden, 'and it is shown while a story is open');
  assert.ok(!/\d+ words|\d+% (full|used)/.test(html('bar')),
    'and the header carries neither the word count nor the percentage any more');

  // A HANDLE (a ⌄ until 2026-10-30) IN ITS PLACE UNTIL IT IS PRESSED — Seth, 2026-10-26: the stats "should be replaced by a down
  // arrow that when triggered show those stats, hitting again can hide it". Always open before that.
  const read = html('ctxread');
  assert.doesNotMatch(read, /scene 2 of 2|words/, 'the reading is shut with nothing pressed');
  assert.match(read, /data-ctxtoggle="1"[^>]*aria-expanded="false"/, 'and is a handle in its place, saying so');
  // A HANDLE, NOT AN ARROW (Seth, 2026-10-30: "instead of the down caret for the context line and the
  // bottom input let's add a small handle"). The same handle on the box's top edge.
  assert.match(read, /data-ctxtoggle="1"[\s\S]*?<span class="grip" aria-hidden="true"><\/span>/, 'HANDLE-CTX: the numbers open by a small handle');
  assert.doesNotMatch(read, /\u2304|\u2303/, '  and no arrow');
  assert.match(html('dockCol'), /id="fold"[^>]*>\s*<span class="grip" aria-hidden="true"><\/span>/, 'HANDLE-BOX: the box folds by the same handle');
  {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
    assert.match(css, /#ctxread:not\(\.shut\) \.ctxtoggle \{[^}]*flex-basis:100%[^}]*order:99/,
      'HANDLE-UNDER: open, the handle is on a line of its own under the numbers (Seth, 2026-10-30)');
  }
  click({ ctxtoggle: '1' });
  const opened = html('ctxread');
  assert.match(opened, /data-ctxtoggle="1"[^>]*aria-expanded="true"/, 'one press opens it, and the arrow says so');
  click({ ctxtoggle: '1' });
  assert.doesNotMatch(html('ctxread'), /words/, 'and a second shuts it');
  click({ ctxtoggle: '1' });   // left open: the checks below read the stats
  assert.match(opened, /<span class="tnum"><i class="kinddot"[^>]*><\/i>2 characters<\/span>/, 'COUNTS-KINDS: it counts the threads sent by kind');
  assert.match(opened, /words/, 'and how many words are in the scene');
  assert.match(opened, /class="ctxicon" data-panel="context"[\s\S]*class="ctxkinds"[\s\S]*class="ctxicon" data-ctxthreads="1"/,
    'COUNTS-ICONS: the context icon on the left, the threads icon on the right (Seth, 2026-11-01)');
  click({ ctxthreads: '1' }); await sleep(10);
  assert.strictEqual(html('sideBody').includes('data-onlyin="1" aria-pressed="true"'), true, 'THREADS-OPEN: the threads icon opens Threads on Sent now');
  assert.match(html('ctxread'), /data-ctxthreads="1" aria-pressed="true"/, '  and says it is open');
  click({ ctxthreads: '1' }); await sleep(10);
  assert.match(html('ctxread'), /data-ctxthreads="1" aria-pressed="false"/, 'THREADS-SHUT: a second press shuts it');
  // SHUT, THE BAR IS DIMMER (Seth, 2026-11-01): a class on the bar while the numbers are away.
  assert.ok(!nodes.get('ctxbar').classList.contains('shut'), 'BAR-OPEN: open, the bar is not dimmed further');
  click({ ctxtoggle: '1' });
  assert.ok(nodes.get('ctxbar').classList.contains('shut'), 'BAR-SHUT-DIM: shut, the bar takes the dimmer class');
  click({ ctxtoggle: '1' });
  {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
    assert.match(css, /#ctxbar\.shut i\.word \{ opacity:\.2; \}/, '  in which a word-woken one is dimmer than open');
    assert.match(css, /#ctxbar i\.new \{ animation:sentblink 1\.4s ease-in-out 3; \}/, 'BLINK-CSS: a new one blinks three times, slowly');
    assert.match(css, /justify-content:center/, 'CENTRED: the lines are centred');
  }
  // A THREAD THAT COMES IN BLINKS (Seth, 2026-11-01), and the ones already there do not.
  assert.doesNotMatch(html('ctxbar'), /class="[^"]*\bnew\b/, 'BLINK-NOT-FIRST: nothing blinks on a drawing the bar has already seen');
  const wasBlocks = MANIFEST.manifest.blocks;
  MANIFEST.manifest.blocks = [...wasBlocks, { kind: 'CANON-TRIGGERED', id: 'e-2', text: '', tokens: 50, state: 'included', reason: 'keyword', firedBy: ['stair'] }];
  click({ open: 's-1' }); await sleep(40);
  assert.match(html('ctxbar'), /<i class="word new" data-sentkind="lore"/, `BLINK-NEW: the thread that came in blinks (${html('ctxbar')})`);
  assert.strictEqual([...html('ctxbar').matchAll(/\bnew\b/g)].length, 1, '  and only it');
  MANIFEST.manifest.blocks = wasBlocks;
  click({ open: 's-1' }); await sleep(40);
  assert.match(opened, new RegExp(`room ${pct}% used`), 'and how much of his room is used, in those words');
  assert.match(opened, /data-panel="context"/, 'with the way through to the blocks behind it');

  // NO ROOM IS NOT NO BAR. A budget of zero — llama-server unreachable so the slot is unknown, or
  // a prompt that will not fit — makes the percentage null, and the first version hid the meter
  // for it. That took the bar away at the moment it says the most, and it hid it through a whole
  // browser scenario because the test server has no model to size a slot with.
  const realBudget = MANIFEST.manifest.totals.budget;
  MANIFEST.manifest.totals.budget = 0;
  click({ open: 's-1' });
  await sleep(40);
  assert.ok(!nodes.get('ctxbar').hidden, 'the bar stays when there is no room — that is when it matters');
  assert.match(html('ctxread'), /no space/, 'and the reading says so in words');
  MANIFEST.manifest.totals.budget = realBudget;
  click({ open: 's-1' });
  await sleep(40);
}
ok('the bar is the threads sent now by kind, and the numbers open by a handle');

// FOUR STATES ON A THREAD'S MARK (Seth, 2026-11-01): on, woken (its word is on the page), on a word
// and asleep, and off. OFF IS ARCHIVED FOR THE WHOLE TALE (2026-11-02), a setting of its own, and the
// tap goes off → on a word → on → off, clearing any pin this scene holds on the thread first. The mark
// moves at once and the writes queue, so two quick taps are two steps. A tip names the state.
{
  const wasPins = STORY.pins;
  const took = STORY.entries.find((e: any) => e.id === 'e-took') as any;
  const tookWas = took.activation;
  took.activation = 'off';
  STORY.pins = [{ chapterId: STORY.currentChapter.id, entryId: 'e-2', mode: 'force_out' }] as any;
  click({ open: 's-1' }); await sleep(40);
  click({ panel: 'threads' }); click({ backentry: '1' }); click({ onlyin: '0' }); await sleep(10);
  const reach = (id: string) => html('sideBody').match(new RegExp(`data-flipact="${id}" data-look="(\\w+)" data-reach="(\\w+)"[^>]*aria-label="([^"]*)"`))?.slice(1);
  assert.deepStrictEqual(reach('e-1')?.slice(0, 2), ['eye', 'on'], 'REACH-ON: always on is an open eye');
  assert.deepStrictEqual(reach('e-fired')?.slice(0, 2), ['eyeheard', 'woken'], 'REACH-WOKEN: woken by its word is the eye with a speech mark');
  assert.deepStrictEqual(reach('e-took')?.slice(0, 2), ['eyeoff', 'off'], 'REACH-OFF: set off is the eye struck through');
  assert.deepStrictEqual(reach('e-2')?.slice(0, 2), ['eyeoff', 'off'], 'REACH-OFF-PIN: a thread an older tap held out of this scene still shows off');
  assert.match(reach('e-evicted')?.[2] ?? '', /^On, but pushed out of this call for room/, 'REACH-EVICTED: always on but pushed out says so');
  const word = STORY.entries.find((e: any) => e.activation === 'triggered' && !['e-fired', 'e-2'].includes(e.id) && reach(e.id));
  assert.deepStrictEqual(reach(word!.id)?.slice(0, 2), ['eyeshut', 'word'], `REACH-WORD: on a word and asleep is a shut eye (${word?.title})`);
  const writes = () => POSTED.filter((p: any) => ['/api/pin', '/api/entry'].includes(p.url))
    .map((p: any) => p.url === '/api/pin' ? `pin ${p.body.entryId} ${p.body.mode}` : `entry ${p.body.entry.id} ${p.body.entry.activation}`);

  POSTED.length = 0; click({ flipact: 'e-took' });
  assert.deepStrictEqual(reach('e-took')?.slice(0, 2), ['eyeshut', 'word'], 'TAP-NOW: the mark moves the moment it is tapped');
  assert.match(html('sideBody'), /class="eyetip"[^>]*>On a word</, 'TAP-TIP: and a tip names the state');
  await sleep(40);
  assert.deepStrictEqual(writes(), ['entry e-took triggered'], 'TAP-OFF: off goes to on a word');
  POSTED.length = 0; click({ flipact: 'e-fired' }); await sleep(40);
  assert.deepStrictEqual(writes(), ['entry e-fired always_on'], 'TAP-WOKEN: on a word (woken) goes to on');
  POSTED.length = 0; click({ flipact: 'e-1' }); await sleep(40);
  assert.deepStrictEqual(writes(), ['entry e-1 off'], 'TAP-ON: on goes off, for the whole tale, with no pin');
  POSTED.length = 0; click({ flipact: 'e-2' }); await sleep(40);
  assert.deepStrictEqual(writes(), ['pin e-2 null', 'entry e-2 triggered'], 'TAP-PIN: the scene\'s pin comes off first, then on a word');

  // TWO QUICK TAPS ARE TWO STEPS: the second reads the state the first showed, and both are written, in order.
  POSTED.length = 0; click({ flipact: word!.id }); click({ flipact: word!.id });
  assert.deepStrictEqual(reach(word!.id)?.slice(0, 2), ['eyeoff', 'off'], 'TAP-TWICE: word → on → off, on screen at once');
  await sleep(80);
  assert.deepStrictEqual(writes(), [`entry ${word!.id} always_on`, `entry ${word!.id} off`], '  and both written, in order');
  took.activation = tookWas; STORY.pins = wasPins;
  click({ open: 's-1' }); await sleep(40);
}
ok('a thread\'s mark shows four states; a tap goes off, on a word, on, at once and in order, with a tip');

// SENT NOW KEEPS WHAT YOU TAP (Seth, 2026-11-02: "if i turn it off allow it to stay there at least
// until the next entry comes in in case im cycling through"), and KIND TABS under the search.
{
  click({ open: 's-1' }); await sleep(40);
  click({ panel: 'threads' }); click({ backentry: '1' }); click({ onlyin: '1' }); await sleep(10);
  const listed = (id: string) => new RegExp(`data-flipact="${id}"`).test(html('sideBody'));
  assert.ok(listed('e-1'), 'CONTROL: always on is in Sent now');
  // As the real server answers once it is saved: the thread says off and the manifest leaves it out.
  // The fake keeps neither on its own, so without this the list could not drop it either way.
  const e1 = STORY.entries.find((e: any) => e.id === 'e-1') as any, wasAct = e1.activation;
  const b1 = MANIFEST.manifest.blocks.find((b: any) => b.id === 'e-1') as any, wasState = b1.state;
  e1.activation = 'off'; b1.state = 'omitted';
  click({ flipact: 'e-1' }); await sleep(80);
  assert.ok(listed('e-1'), 'KEEP: turned off from Sent now, it stays listed so it can be cycled');
  assert.match(html('sideBody'), /data-flipact="e-1" data-look="eyeoff"/, '  showing off');
  click({ chapter: STORY.currentChapter.id }); await sleep(60);
  assert.ok(listed('e-1'), 'KEEP-HOLDS: a reload with no new passage keeps it');
  // THE NEXT PASSAGE, as the real server would answer once one has landed (the fake does not add it).
  const last = STORY.passages.at(-1) as any;
  STORY.passages.push({ ...last, id: 'p-kept-next', ordinal: last.ordinal + 1, body: 'Then the next thing happened.' });
  click({ chapter: STORY.currentChapter.id }); await sleep(60);
  assert.ok(!listed('e-1'), 'KEEP-UNTIL: once the next passage is in, an off thread leaves Sent now');
  STORY.passages.pop();
  e1.activation = wasAct; b1.state = wasState;

  // KIND TABS: All and one per kind, each with its count, under the search; one kind narrows the list.
  click({ onlyin: '0' }); await sleep(10);
  const side = html('sideBody');
  assert.match(side, /id="thq"[\s\S]*?<div class="thkinds"/, 'KINDS: the tabs are under the search');
  for (const k of ['all', 'character', 'place', 'lore', 'item'])
    assert.match(side, new RegExp(`data-thkind="${k}"`), `  with a tab for ${k}`);
  assert.match(side, /data-thkind="all" aria-pressed="true"/, '  All to start with');
  click({ thkind: 'lore' }); await sleep(10);
  const lore = html('sideBody');
  assert.match(lore, /data-kindhead="lore"/, 'KINDS-ONE: Lore shows the lore');
  assert.doesNotMatch(lore, /data-kindhead="character"/, '  and nothing else');
  assert.match(lore, /data-thkind="lore" aria-pressed="true"/, '  and says which tab is on');
  click({ thkind: 'all' }); await sleep(10);
}
ok('Sent now keeps a thread you tap until the next passage, and kind tabs narrow the list');

/* ---- IN CONTEXT MEANS WHAT THE PROMPT ACTUALLY HOLDS (2026-09-11).
 *
 * Kia's book: 227 threads, every one TRIGGERED, none pinned. The chip read "In context 0" while
 * thirty-three of them were in the prompt and the Context panel was listing them — two screens
 * built to answer one question, disagreeing.
 *
 * The old rule read activation and pins, which is a guess about what WILL fire rather than a report
 * of what DID. It is still the fallback, and only that: the manifest is the assembly the server
 * actually built, block by block, ids and all.
 *
 * BOTH DIRECTIONS, because the rule and the manifest agree about the easy card and that is exactly
 * why a one-card fixture could never have caught this. `e-2` is triggered and fired; `e-3` is
 * always-on and was evicted. The old rule gets both backwards. */
{
  click({ panel: 'threads' });
  await sleep(40);
  click({ onlyin: '1' });
  await sleep(40);
  const inCtx = html('sideBody');
  assert.match(inCtx, /The lamplighter/,
    'a TRIGGERED thread the manifest says fired is in context — the old rule called it out');
  assert.ok(!/The Kesh Accord/.test(inCtx),
    'and an ALWAYS-ON thread the ceiling evicted is not — the old rule called it in, for a card '
    + 'the model never saw');
  assert.match(inCtx, /Envoy Sereth/, 'the card both answers agree about is still there');
  // The count on the chip is the same answer, so the number and the list cannot drift apart.
  assert.match(inCtx, /Sent now <span[^>]*>2</, 'and the chip counts the two that are really in');
  ok('In context is read off the assembled prompt, not guessed from activation');

  // ---- AND THE LIST HAS A SEARCH BAR. Seth, 2026-09-11: "in the story under all threads can i get
  // a search bar there?"
  click({ onlyin: '0' });
  await sleep(40);
  const all = html('sideBody');
  assert.match(all, /id="thq"/, 'the threads list has its own search box');
  assert.match(all, /id="thlist"/, 'and the rows are in a container it can redraw by itself');
  // IT REDRAWS ITS OWN LIST AND NOTHING ELSE. Every other box on this panel saves after a pause in
  // the typing, so a keystroke that repaints the panel throws away what is half-typed — the bug this file
  // records in seven other handlers. Asserted on the source, the way the story panel's chips are.
  const src = (await import('node:fs')).readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  const handler = src.match(/id === 'thq'\)[\s\S]{0,260}/)?.[0] ?? '';
  assert.match(handler, /thlist/, 'the search redraws the list');
  assert.ok(!/\bpaint\(\)/.test(handler), 'and never repaints the panel around it');
  ok('the story’s threads have a search bar that redraws only its own list');

  /* AND IT FINDS THINGS, including the 95% of the library a naive search cannot see. The
   * 2026-08-29 migration moved every card's body into its `facts` room: 23 of 483 cards still have
   * a `body` and 464 have their text in a room. A search over title, body and keys — which is what
   * the cross-book box next door does — is a search over titles and keys with an empty field
   * attached, and it would pass a check written against a fixture whose cards still had bodies. */
  // BY A WORD THAT IS ONLY IN THE TITLE. `lamplighter` below is the card's name AND its trigger
  // word, so it cannot tell a search that reads titles from one that reads keys — deleting the
  // title from `threadText` left every other case here green.
  typeIn('thq', 'Sereth');
  assert.match(html('thlist'), /Envoy Sereth/,
    'a thread is found by a word that appears only in its title');

  typeIn('thq', 'gaslamps');
  assert.match(html('thlist'), /The lamplighter/,
    'and by a trigger word that appears nowhere else on the card');

  typeIn('thq', 'lamplighter');
  let list = html('thlist');
  assert.match(list, /The lamplighter/, 'and by its name');
  assert.ok(!/Envoy Sereth/.test(list), 'and the ones that do not match are gone');

  typeIn('thq', 'unhurried');
  assert.match(html('thlist'), /Envoy Sereth/,
    'a thread is found by words that live in a ROOM — where 464 of 483 cards keep their text');

  typeIn('thq', 'How she sounds');
  assert.match(html('thlist'), /Envoy Sereth/,
    "and by the room's NAME, which is how you look for the card with the hands");

  typeIn('thq', 'zzzznotathing');
  assert.match(html('thlist'), /No thread here matches/,
    'a search that finds nothing says so — an empty list under a box you just typed in reads as broken');

  typeIn('thq', '');
  assert.match(html('thlist'), /Envoy Sereth/, 'and clearing the box brings the list back');
  ok('the thread search reads the rooms, not just the title a card may not keep its text in');
}

// ---- THE TALE PANEL IS FOUR GROUPS BEHIND FOUR CHIPS, AND OPENS ON TALE (#130, 2026-11-03).
// Seth (bugs.md): "The tale should be called Tale and should be the first thing a tale opens to."
// Voice went into Tale: the cover first, then what the tale is, then how it is written, then Spice.
{
  click({ panel: 'story' });
  await sleep(40);
  let panel = html('sideBody');
  assert.deepStrictEqual([...panel.matchAll(/data-storytab="(\w+)"[^>]*>([^<]+)</g)].map((m) => [m[1], m[2].trim()]),
    [['book', 'Tale'], ['thread', 'Thread'], ['world', 'Setting'], ['keep', 'Keep']],
    'TALE-TABS: the tab row is Tale, Thread, Setting, Keep, in that order');
  for (const g of ['book', 'thread', 'world', 'keep'])
    assert.match(panel, new RegExp(`data-group="${g}"`), `the panel must draw the ${g} group`);
  assert.doesNotMatch(panel, /data-group="voice"/, 'TALE-NO-VOICE: there is no Voice group');
  // ALL FOUR ARE DRAWN AND ONE IS SHOWN. The container says which, and the stylesheet does the
  // hiding — asserted here as the attribute, because that is the contract the CSS reads.
  assert.match(panel, /data-tab="book"/, 'TALE-OPENS: the panel opens on Tale');
  const tale = panel.match(/data-group="book"[\s\S]*?data-group="world"/)?.[0] ?? '';
  const at = (re: RegExp) => tale.search(re);
  // THE ORDER: cover, its fold, title, genre, how it began, the voice fields, then Spice.
  const order = [/class="readpic"/, /data-fold="talecover"/, /id="f-story-title"/, /id="f-story-genre"/,
    /id="f-story-premise"/, /id="f-story-writingStyle"/, /id="f-story-styleNote"/, /id="f-story-spice"/,
    /id="f-story-spiceNote"/].map(at);
  assert.ok(order.every((n) => n > -1), `TALE-HOLDS: Tale holds the cover, its fold, the tale, the voice and Spice (${order})`);
  assert.deepStrictEqual([...order].sort((a, b) => a - b), order, 'TALE-ORDER: in that order');
  assert.match(tale, /<img class="readpic" src="[^"]*api\/cover\?story=s-1/, 'TALE-COVER: the cover is drawn as a thread\'s picture is');
  // THE FOLD: closed, and every cover control and heading setting inside it.
  const fold = tale.match(/<details class="fold[^>]*>[\s\S]*?<\/details>/)?.[0] ?? '';
  assert.ok(fold && !/<details[^>]*\bopen\b/.test(fold.slice(0, fold.indexOf('>') + 1)), 'TALE-FOLD-SHUT: the cover fold is closed by default');
  for (const [what, re] of [['Replace', /data-cover="1"/], ['Remove', /data-delcover="1"/], ['Have one drawn', /data-drawcover="open"/],
    ['Find one online', /data-findcover="open"/], ['the head of every scene', /data-story="chapterHero"/]] as const)
    assert.match(fold, re, `TALE-FOLD-HOLDS: ${what} is inside the fold`);
  assert.doesNotMatch(tale.replace(fold, ''), /data-cover=|data-delcover|data-drawcover|data-findcover|data-story="chapter|data-story="cover/,
    '  and none of them outside it');
  // A PRESS ON THE FOLD DOES NOT REPAINT, the same sentinel as the explanations use: every box on
  // this panel saves after a pause, and a repaint inside it puts the stored text back on screen.
  nodes.get('sideBody').innerHTML = 'STALE';
  click({ fold: 'talecover' }); await sleep(30);
  assert.strictEqual(html('sideBody'), 'STALE', 'TALE-FOLD-QUIET: opening the cover fold does not repaint the panel');
  click({ panel: 'story' }); await sleep(40);
  assert.match(html('sideBody'), /<details class="fold[^>]*\bopen\b[^>]*>\s*<summary[^>]*data-fold="talecover"/,
    '  and it stays open through the next repaint that does happen');
  click({ fold: 'talecover' }); click({ panel: 'story' }); await sleep(40);
  // NO COVER: the add controls are out, as there is nothing to hide them behind.
  const hadCover = (STORY as any).cover;
  (STORY as any).cover = null;
  click({ open: 's-1' }); await sleep(40);
  click({ panel: 'story' }); await sleep(40);
  panel = html('sideBody');
  const bare = panel.match(/data-group="book"[\s\S]*?data-group="world"/)?.[0] ?? '';
  assert.doesNotMatch(bare, /class="readpic"|<details/, 'TALE-NO-COVER: with no cover there is no picture and no fold');
  for (const re of [/data-cover="1"/, /Choose an image/, /data-drawcover="open"/, /data-findcover="open"/])
    assert.match(bare, re, `TALE-ADD: with no cover the add controls are out (${re})`);
  (STORY as any).cover = hadCover;
  click({ open: 's-1' }); await sleep(40);
  // AN OLD `voice` TAB LANDS ON TALE.
  click({ storytab: 'voice' }); click({ panel: 'story' }); await sleep(40);
  assert.match(html('sideBody'), /data-tab="book"/, 'TALE-OLD-VOICE: a stored voice tab opens Tale');
  assert.match(html('sideBody'), /data-storytab="book"[^>]*aria-pressed="true"/, '  with the Tale chip pressed');
  // AND PRESSING A CHIP DOES NOT REDRAW, which is asserted ON THE SOURCE rather than through this
  // harness. Every box in the panel saves after a pause in the typing, so a repaint on a tab press
  // throws away a half-written premise — the bug this file records seven times in other handlers.
  // A DRAWN-count check was tried here first and it could not fire: paint() against these stubs
  // fetches nothing, so it went green with paint() put back. The behaviour itself is driven in
  // test/ui/panels.js, where a real box is typed into and a real tab is pressed; this is the
  // cheap guard that the handler has not grown a repaint since.
  {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
    const branch = src.match(/if \(d\.storytab\) \{[\s\S]*?\n  \}/)?.[0] ?? '';
    assert.ok(branch, 'the storytab handler must be findable');
    assert.ok(!/paint\(\)/.test(branch),
      'switching group must not repaint — the typed fields are not saved yet');
  }
  // BACK TO THE PANEL THIS FILE WAS ON. The checks below read #sideBody for the context inspector,
  // and a block that leaves another panel open makes them fail a long way from the cause.
  click({ panel: 'context' });
  await sleep(40);
}
ok('the Tale panel is Tale, Thread, Setting and Keep, opens on Tale, and keeps the cover controls in one fold');

// In words on screen since 2026-10-25 ("46% of his room"); the counts are kept in its tooltip.
assert.match(html('sideBody'), />46% of his room</);
assert.match(html('sideBody'), /21,401 of 46,146 tokens, counted by the model/,
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
  const bar = html('sideBody').match(/<div class="meter(?: [^"]*)?">([\s\S]*?)<\/div>/);
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
  await sleep(40);
  click({ panel: 'context' });
  const asleep = html('sideBody');
  assert.match(asleep, /27,401 of 46,146 tokens, estimated/,
    'with no tokenizer answer the estimate is what there is, and it is shown');
  // "roughly" in words since 2026-10-25, where it said "(est.)".
  assert.match(asleep, /of his room, roughly/,
    'and it is MARKED. An estimate that looks like a measurement is the surface telling the '
    + 'writer something it does not know, and 2a is exactly how wrong it can be.');
  (MANIFEST as any).exact = realExact;
  click({ open: 's-1' });
  await sleep(40);
  click({ panel: 'context' });
  assert.ok(!/of his room, roughly/.test(html('sideBody')),
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
assert.match(html('bar'), /10 scenes out of reach/,
  'the bar names how many chapters the model can no longer read (1 plus the arc\'s nine)');
assert.match(html('sideBody'), /Scenes 1&ndash;11 are out of his reach/,
  'and the panel names which — the range, not the block count');
assert.match(html('sideBody'), /Summaries<\/strong> gathers/, 'and what to do about it (the Summaries tab, where chapters are gathered)');
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
  await sleep(40);
  click({ panel: 'setup' });
  await sleep(20);
  assert.strictEqual(asked(), before + 1,
    'a chapter still holding the title endChapter gave it has not been named, and must be');
  STORY.currentChapter.title = 'The Envoy';
}
ok('a chapter names itself when it opens, and a placeholder title is not a name');

  // #127 · A CHALKED STRING IS A WORKBENCH CARD (ADR 0011); the strings the tale already has are not.
  click({ panel: 'waiting' });
  await sleep(30);
  const strings = html('sideBody');
  const chalked = strings.slice(strings.indexOf('A string, chalked'));
  assert.match(chalked, /^A string, chalked[\s\S]*?The debt nobody has called in/, 'a proposed string waits on the Workbench');
  assert.match(chalked, /set up in scene 2/, 'with the scene it came from');
  assert.doesNotMatch(strings, /The letter he has not opened/, 'and the strings the tale already has are not dealt beside it (2026-10-29)');
  assert.doesNotMatch(chalked.slice(0, chalked.indexOf('data-deckcard=')), /Witness rite/, 'and not on a thread proposal\'s card');

  click({ panel: 'chapter' });
  await sleep(30);
  const chapter = html('sideBody');
  assert.match(chapter, /Witness rite/, 'the chapter queue keeps the thread proposals');
  assert.doesNotMatch(chapter, /The debt nobody has called in/,
    'and does not also show the string, which would be two places to answer one offer');
  // #129 · The queue used to say "they wait under Strings". A chalked string is a Workbench card now
  // (#127), and Strings lists only the tale's own, so that line sent the writer to the wrong place.
  assert.doesNotMatch(chapter, /string chalked|wait under Strings/,
    'CHALK-NO-STRINGS: the chapter queue does not send a chalked string to Strings');
  ok('a proposed string waits on the Workbench, and the chapter queue does not send it to Strings');

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
  await sleep(30);
  const onlyConflict = html('sideBody');
  assert.match(onlyConflict, /The stair/, 'a chip narrows the queue to its kind');
  assert.doesNotMatch(onlyConflict, /Witness rite/, 'and drops the others');
  assert.doesNotMatch(onlyConflict, /data-acceptall/,
    'and Add all is still not offered — a conflict is sometimes the model being wrong');

  click({ pkind: 'new' });
  await sleep(30);
  const onlyNew = html('sideBody');
  assert.match(onlyNew, /data-acceptall="new"/, 'Add all appears on new, which is the additive kind');
  assert.doesNotMatch(onlyNew, /The stair/);
  ok('the queue splits by kind, and Add all is offered on new alone');

  // WHERE IT LANDS IS ABOVE THE WORDS, not under them. It sat below the textarea, so the
  // destination of a change was read after the change and on a long body was off the card entirely.
  // Asserted by POSITION, because "the text is present somewhere" was already true before.
  click({ pkind: 'changed' });
  await sleep(30);
  const onlyChanged = html('sideBody');
  const landsAt = onlyChanged.indexOf('Lands in the appearance pocket');
  const bodyAt = onlyChanged.indexOf('data-pbody');
  assert.ok(landsAt > -1 && bodyAt > -1, 'the card says where it lands and offers the body');
  assert.ok(landsAt < bodyAt, 'and says where it lands BEFORE the words that will land there');
  // The room is a chip on the title row, so a queue can be read without opening anything.
  assert.match(onlyChanged, /class="tag(?: [^"]*)?"[^>]*>appearance</, 'the room is a chip on the card');
  // Spoken, not stored: `who_is_here` is a column name. Proved on a slot that has underscores.
  const spoken = html('sideBody');
  assert.doesNotMatch(spoken, /who_is_here/, 'no room name is shown with its underscores');
  ok('a proposal says where it lands before it says what lands, and wears the room as a chip');

  // WHERE IT GOES IS A CONTROL, NOT A CHIP. Seth, 2026-09-01: *"if i ask anansi through the chat
  // that i want to pad the card or add more info it wants to add it to facts, not info, it doesnt
  // matter if it belongs to a room it all goes to facts."* The room was read-only here, so a
  // proposal aimed at the wrong part of a card could only be rejected and the whole thing retyped.
  // The server half — the chat could not name a room at all — is in `test/talk.ts` 6c.
  assert.match(onlyChanged, /data-pwhere="pr-3"/, 'a change to a card that exists offers the room');
  assert.match(onlyChanged, /<option value="appearance" selected/,
    'showing the room the model chose as the one selected, or the control lies about the state');
  // EVERY ROOM THIS KIND HAS AND NO OTHER. Read from `V.slots` — the server's copy of
  // src/slots.ts — for the reason the card form reads them from there: a hand-written list on the
  // screen drifts from the one the database enforces.
  for (const room of ['interiority', 'voice', 'relationships'])
    assert.match(onlyChanged, new RegExp(`<option value="${room}"`), `no way to send it to ${room}`);
  // #77. NOT ALWAYS TRUE, on a thread that exists: only the writer changes it, and a change aimed at
  // it is sewn in as Over time. Nor the pockets that folded into it.
  for (const room of ['facts', 'role', 'history'])
    assert.doesNotMatch(onlyChanged, new RegExp(`<option value="${room}"`), `a change can be sent to ${room}`);
  assert.doesNotMatch(onlyChanged, /<option value="provenance"/,
    'a character is being offered an item\'s room');
  // The trigger words, editable. A room nobody keyed mostly never fires — the same rule the
  // accept path enforces by switching on a keyless room.
  assert.match(onlyChanged, /data-pkeys="pr-3"/, 'the words that wake the card are editable');
  // A change or a state, which the writer decides and the model cannot.
  assert.match(onlyChanged, /data-pstate="pr-3"/, 'and it can be taken as a state instead');
  assert.match(onlyChanged, /data-pchap="pr-3"/, 'from a chapter the writer names');
  ok('a change to an existing card offers its rooms, its trigger words, and the state option');

  // SPOKEN, NOT STORED, the same rule the chip above already follows. Proved on a slot that has
  // underscores, which means a lore card — a character has none. `pr-4` is a change to the stair.
  click({ pkind: 'conflict' });
  await sleep(30);
  const onlyConflict2 = html('sideBody');
  assert.match(onlyConflict2, /data-pwhere="pr-4"/, 'a conflict on an existing card offers rooms too');
  assert.match(onlyConflict2, /<option value="who_is_here"[^>]*>who is here</,
    'a room name is offered to the writer with its underscores showing');
  assert.doesNotMatch(onlyConflict2, /<option value="interiority"/,
    'a place is being offered a character\'s room');

  // A ROOM NEEDS A CARD TO BE A ROOM OF. `pr-1` is a brand-new thread: its body IS the whole of
  // it, the server drops a field on one (`roomAsked`), and offering a control that cannot work is
  // worse than offering none.
  click({ pkind: 'new' });
  await sleep(30);
  const fresh = html('sideBody');
  assert.match(fresh, /data-pbody="pr-1"/, 'the new thread is on screen');
  assert.doesNotMatch(fresh, /data-pwhere="pr-1"/,
    'a card that does not exist yet is being offered rooms it cannot have');
  assert.doesNotMatch(fresh, /data-pstate="pr-1"/, 'nor a state of nothing');
  ok('a proposal for a card that does not exist yet is offered no room and no state');

  // MOVING IT GOES TO THE SERVER. `proposals.target` — the room a Replace would stand in for — is
  // recomputed for the room chosen, and that rule lives in `roomOffer`. Deciding it here would
  // put one rule in two places, which is the drift the fix exists to end.
  click({ pkind: 'changed' });
  await sleep(30);
  {
    const changeIn = (target: any) => (listeners.change ?? []).forEach((f: Function) => f({ target }));
    const doc = (globalThis as any).document;
    const wasQS = doc.querySelector;
    doc.querySelector = (sel: string) =>
      sel === '[data-pwhere="pr-3"]' ? { value: 'interiority' }
      : sel === '[data-pkeys="pr-3"]' ? { value: 'Aldis, thinner' }
      : sel === '[data-pbody="pr-3"]' ? { value: 'She is thinner than she was.' } : null;
    try {
      POSTED.length = 0;
      changeIn({ dataset: { pwhere: 'pr-3' } });
      await sleep(60);
      const sent = POSTED.find((x) => String(x.url) === '/api/proposal/where');
      assert.ok(sent, 'changing the room posted nothing — the choice lived only on screen');
      assert.strictEqual(sent.body.field, 'interiority', 'and carries the room chosen');
      assert.deepStrictEqual(sent.body.keys, ['Aldis', 'thinner'],
        'and the trigger words, split on commas rather than sent as one string');
      // THE EDITED BODY RIDES ALONG, which is what makes the repaint after a move safe: the decide
      // handler's own note has warned since it was written that a repaint mid-edit loses the box.
      assert.strictEqual(sent.body.body, 'She is thinner than she was.',
        'moving a proposal would throw away the words already changed');

      // Editing the keys alone goes through the same door.
      POSTED.length = 0;
      changeIn({ dataset: { pkeys: 'pr-3' } });
      await sleep(60);
      assert.ok(POSTED.some((x) => String(x.url) === '/api/proposal/where'),
        'editing the trigger words saved nothing');
      ok('moving a proposal or keying it is saved on the server, edit and all');

      // AND THE STATE BOX REACHES THE ROUTE. Accept-time rather than saved: it is chosen in the
      // same breath as the press.
      doc.querySelector = (sel: string) =>
        sel === '[data-pstate="pr-3"]' ? { checked: true }
        : sel === '[data-pchap="pr-3"]' ? { value: '4' } : null;
      POSTED.length = 0;
      click({ decide: 'accept', id: 'pr-3' });
      await sleep(60);
      const took = POSTED.find((x) => String(x.url) === '/api/proposal');
      assert.ok(took, 'accepting posts to the route');
      assert.strictEqual(took.body.asState, 4,
        'the state box was ticked and the chapter typed, and neither reached the route');
      ok('taking a change as a state instead sends the chapter it starts from');
    } finally { doc.querySelector = wasQS; }
  }

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
  await sleep(30);

// Editing a proposal before it lands. The route has honoured an incoming body since it was
// written and the surface never sent one, so what the model wrote was what entered canon even
// after the writer had changed it on screen. The panel also showed `delta || body` — for a
// conflict or an update that meant the text about to become canon was never displayed at all.
{
  const chapter = html('sideBody');   // the chapter panel, from the block above
  assert.match(chapter, /data-pbody="pr-1"/, 'a thread proposal offers a box, not a paragraph');
  assert.match(chapter, /A signature is void\./, 'holding what will be written');
  assert.match(chapter, /New fact\./, 'with the delta still shown beside it');

  click({ panel: 'waiting' });
  await sleep(30);
  assert.match(html('sideBody'), /data-pbody="pr-2"/, 'and so does a proposed string, on the Workbench (#127)');

  // The box lives in the DOM, so the handler has to read it. Only this selector answers.
  const doc = (globalThis as any).document;
  const wasQS = doc.querySelector;
  doc.querySelector = (sel: string) =>
    sel === '[data-pbody="pr-1"]' ? { value: 'Rewritten by hand.' } : null;
  try {
    POSTED.length = 0;
    click({ decide: 'accept', id: 'pr-1' });
    await sleep(60);
    const sent = POSTED.find((x) => String(x.url).startsWith('/api/proposal'));
    assert.ok(sent, 'accepting a proposal posts to the route');
    assert.strictEqual(sent.body.accept, true);
    assert.strictEqual(sent.body.body, 'Rewritten by hand.',
      'and carries what is in the box, not what the model said');

    // Rejecting must not carry one: the route ignores it, and sending it would claim the wording
    // of something thrown away mattered.
    POSTED.length = 0;
    click({ decide: 'reject', id: 'pr-1' });
    await sleep(60);
    const dropped = POSTED.find((x) => String(x.url).startsWith('/api/proposal'));
    assert.ok(dropped, 'rejecting posts too');
    assert.strictEqual(dropped.body.accept, false);
    assert.strictEqual(dropped.body.body, undefined, 'and carries no body');
  } finally { doc.querySelector = wasQS; }
  ok('a proposal shows what it will write, and an edit is what gets sent');
}

// A THREAD'S ALTER, AND ITS ALWAYS TRUE, SAVE AS YOU TYPE (ADR 0004, pass three). Every write of a
// thread or a pocket keeps a revision and can mark scene summaries out of date, so a pause writes a
// DRAFT, which does neither, and Done sends one last write naming what Alter opened on: the revision
// and the staling are worked out once, against that. Always true has no name box and keeps the name it
// has (Seth, 2026-10-28: "it's saying a pocket needs a name"); an emptied one is never written.
{
  const e1 = STORY.entries.find((x: any) => x.id === 'e-1') as any;
  const wasEntries = STORY.entries;
  // A copy, since a write updates the open tale's thread in place and the fixture is shared.
  STORY.entries = wasEntries.map((x: any) => x === e1 ? { ...e1, addons: [...e1.addons,
    { id: 'a-facts', slot: 'facts', name: 'Who she is', body: 'An envoy of Kesh.', keys: [], active: true }] } : x);
  const doc = (globalThis as any).document;
  const wasQS = doc.querySelector;
  const boxes: Record<string, any> = {};
  const fill = (title: string, body: string, facts: string, factsId = 'a-facts') => {
    for (const k of Object.keys(boxes)) delete boxes[k];
    Object.assign(boxes, { '[data-f="title"]': { value: title }, '[data-f="body"]': { value: body },
      '[data-f="notes"]': { value: '' }, '[data-f="keys"]': { value: '' }, [`[data-ab="${factsId}"]`]: { value: facts } });
  };
  const type = (sel: string, value: string) => {
    boxes[sel].value = value;
    const m = /\[data-(f|ab)="([^"]+)"\]/.exec(sel)!;
    (listeners.input ?? []).forEach((f: Function) => f({ target: { value, dataset: { [m[1]]: m[2] } } }));
  };
  const writes = () => POSTED.filter((x) => x.url === '/api/entry' || x.url === '/api/addon')
    .map((x) => [x.url, x.url === '/api/entry' ? x.body.entry.body : x.body.addon.body, x.body.draft ?? null, x.body.opened ?? null]);
  doc.querySelector = (sel: string) => boxes[sel] ?? null;
  try {
    click({ open: 's-1' }); await sleep(40);
    click({ panel: 'threads' }); click({ entry: 'e-1' }); click({ cardview: 'form' }); click({ cardtab: 'card' });
    await sleep(30);
    fill('Envoy Sereth', '[speaks for Kesh]', 'An envoy of Kesh.');
    const head = html('sideHead');
    assert.doesNotMatch(head, /data-saveentry|data-cancelalter|>Save</, 'ALTER-THREAD-NO-SAVE: Alter has no Save and no Cancel');
    assert.match(head, /data-alterundo="1"[\s\S]*Undo my changes[\s\S]*data-alterdone="1"[\s\S]*Done/,
      'ALTER-THREAD-HEAD: Undo my changes on the left, Done on the right');
    assert.doesNotMatch(html('sideBody'), /data-saveaddon/, 'ALWAYS-TRUE-NO-SAVE: Always true has no Save of its own');
    POSTED.length = 0;
    type('[data-f="body"]', '[speaks for Kesh, and lies]');
    type('[data-ab="a-facts"]', 'An envoy of Kesh, and a spy.');
    await sleep(400);
    assert.deepStrictEqual(writes(), [], 'ALTER-THREAD-PAUSE: nothing is written while the typing goes on');
    await sleep(700);
    assert.deepStrictEqual(writes(), [['/api/addon', 'An envoy of Kesh, and a spy.', true, null],
      ['/api/entry', '[speaks for Kesh, and lies]', true, null]],
      'ALTER-THREAD-DRAFT: the pause writes Always true and the thread, each as a draft');
    const facts = POSTED.find((x) => x.url === '/api/addon')?.body.addon;
    assert.deepStrictEqual(facts, { id: 'a-facts', slot: 'facts', name: 'Who she is', body: 'An envoy of Kesh, and a spy.', keys: '' },
      'ALWAYS-TRUE-NAME: with no name box, Always true keeps the name it has');
    POSTED.length = 0;
    type('[data-f="title"]', 'Envoy Sereth Vane');
    click({ alterdone: '1' }); await sleep(60);
    assert.deepStrictEqual(writes(), [['/api/addon', 'An envoy of Kesh, and a spy.', null, { name: 'Who she is', body: 'An envoy of Kesh.' }],
      ['/api/entry', '[speaks for Kesh, and lies]', null, { title: 'Envoy Sereth', body: '[speaks for Kesh]', keys: [] }]],
      'ALTER-THREAD-DONE: Done sends the last write of each, naming what Alter opened on');
    assert.strictEqual(POSTED.find((x) => x.url === '/api/entry')?.body.entry.title, 'Envoy Sereth Vane', '  with the last of the typing');
    assert.doesNotMatch(html('sideHead'), /data-alterdone/, '  and goes back to Read');

    // The tale now holds what Done wrote, and Alter opens on that.
    const T = 'Envoy Sereth Vane', B = '[speaks for Kesh, and lies]', F = 'An envoy of Kesh, and a spy.';
    const opened = { title: T, body: B, keys: [] };
    // UNDO MY CHANGES after a pause: the text Alter opened on, as the last write, so nothing is kept.
    click({ cardview: 'form' }); await sleep(30);
    fill(T, B, F);
    POSTED.length = 0;
    type('[data-f="body"]', '[speaks for nobody]'); await sleep(1000);
    click({ alterundo: '1' }); await sleep(20);
    assert.match(html('sideHead'), /data-alterdone/, 'ALTER-THREAD-UNDO-ASKS: Undo my changes with a change typed asks first');
    click({ alterundo: '1' }); await sleep(60);
    assert.deepStrictEqual(writes(), [['/api/entry', '[speaks for nobody]', true, null], ['/api/entry', B, null, opened]],
      'ALTER-THREAD-UNDO: the second press writes back what it opened on, as the last write');
    assert.doesNotMatch(html('sideHead'), /data-alterdone/, '  and goes back to Read');

    // A HIDDEN TAB sends the last write, after the pause it cut short.
    click({ cardview: 'form' }); await sleep(30);
    fill(T, B, F);
    POSTED.length = 0;
    type('[data-f="body"]', '[speaks for Kesh, softly]');
    doc.visibilityState = 'hidden';
    try { (listeners.visibilitychange ?? []).forEach((f: Function) => f({})); await sleep(40); } finally { doc.visibilityState = 'visible'; }
    assert.deepStrictEqual(writes(), [['/api/entry', '[speaks for Kesh, softly]', true, null],
      ['/api/entry', '[speaks for Kesh, softly]', null, opened]],
      'ALTER-THREAD-HIDDEN: a hidden tab writes the pause, then the last write');
    POSTED.length = 0;
    click({ alterdone: '1' }); await sleep(60);
    assert.deepStrictEqual(writes(), [], 'ALTER-THREAD-HIDDEN-ONCE: and Done after it sends nothing more');

    // AN EMPTIED ALWAYS TRUE is never written: Done says so and stays.
    click({ cardview: 'form' }); await sleep(30);
    fill(T, '[speaks for Kesh, softly]', F);
    POSTED.length = 0;
    type('[data-ab="a-facts"]', '  '); await sleep(1000);
    click({ alterdone: '1' }); await sleep(60);
    assert.deepStrictEqual(writes(), [], 'ALWAYS-TRUE-EMPTY: an empty Always true is not written');
    assert.match(html('sideHead'), /data-alterdone/, '  and Done stays on Alter');
    click({ alterundo: '1' }); click({ alterundo: '1' }); await sleep(60);
  } finally { doc.querySelector = wasQS; STORY.entries = wasEntries; }
  ok("a thread's Alter and its Always true save as you type, as drafts, and Done sends the last write");
}

// #126 · A THREAD WITH NO ALWAYS TRUE GETS ONE FROM THE THREAD TAB. The add tray offered it while a
// thread had none; the pocket panel does not (it is not a pocket), so the box is drawn empty here, and
// what is typed in it makes it, with no id.
{
  click({ open: 's-1' }); await sleep(40);
  click({ panel: 'threads' }); click({ entry: 'e-2' });
  click({ cardview: 'form' }); click({ cardtab: 'card' });
  await sleep(30);
  assert.match(html('sideBody'), /data-ab="facts"/, 'ALWAYS-TRUE-NEW: an empty box');
  const doc = (globalThis as any).document;
  const wasQS = doc.querySelector;
  const box = { value: '' };
  doc.querySelector = (sel: string) => sel === '[data-ab="facts"]' ? box : null;
  // The route answers with the id it made, as the real one does.
  const canned = (globalThis as any).fetch;
  (globalThis as any).fetch = async (url: string, init?: any) => url === '/api/addon'
    ? (POSTED.push({ url, body: JSON.parse(init.body), method: init.method }), { ok: true, json: async () => ({ addonId: 'a-made' }) })
    : canned(url, init);
  const e2 = STORY.entries.find((x: any) => x.id === 'e-2') as any, hadAddons = e2.addons;
  try {
    POSTED.length = 0;
    box.value = 'Unlit, below the counting floor.';
    (listeners.input ?? []).forEach((f: Function) => f({ target: { value: box.value, dataset: { ab: 'facts' } } }));
    await sleep(1000);
    assert.deepStrictEqual(POSTED.find((x) => x.url === '/api/addon')?.body,
      { storyId: 's-1', entryId: 'e-2', addon: { slot: 'facts', name: 'facts', body: 'Unlit, below the counting floor.', keys: '' }, draft: true },
      'ALWAYS-TRUE-NEW: what is typed makes the Always true, with no id');
    click({ cardtab: 'card' }); await sleep(20);
    assert.match(html('sideBody'), /data-ab="a-made"[^>]*>Unlit, below the counting floor\.</,
      'ALWAYS-TRUE-NEW-KEPT: a repaint after the pause draws the Always true it made, with its text');
    click({ alterdone: '1' }); await sleep(60);
  } finally { doc.querySelector = wasQS; (globalThis as any).fetch = canned; e2.addons = hadAddons; }
  click({ backentry: '1' });
  ok('a thread with no Always true gets one from The thread tab');
}

// Every theme one row, every token derived from it. Three hand-written CSS blocks is why
// there were three: a new theme meant restating the greys, the gold and the chrome by hand, and
// the light one that forgot rendered dark text on cream.
{
  const { THEMES, themeVars, themeNow } = await import('../web/model.js');
  assert.deepStrictEqual(Object.keys(THEMES), ['ink', 'grimdark', 'scifi', 'romance']);
  // THE FIVE THAT LEFT (2026-11-02). A look saved with one of them still paints a theme that exists.
  for (const gone of ['obsidian', 'parchment', 'fantasy', 'novelist', 'no-such-theme'])
    assert.strictEqual(themeNow(gone), 'ink', `THEME-WAS: a look saved as ${gone} reads as Ink`);
  assert.strictEqual(themeNow('cyberpunk'), 'scifi', 'THEME-WAS: and Cyberpunk as Sci-fi');
  assert.strictEqual(themeNow('romance'), 'romance', 'a theme still on the list is left alone');
  assert.deepStrictEqual(themeVars('obsidian'), themeVars('ink'), 'and its colours are the ones it reads as');

  // Named explicitly, not read off one theme and compared to the others: deriving the expected
  // set from obsidian meant a token deleted from ALL nine still matched, which is what happened
  // when I first wrote this and deleted one to watch it go red.
  const NEEDED = ['--doc-bg', '--doc-wash', '--rail', '--sheet', '--body', '--ink', '--ink-bright',
    '--narr', '--label', '--mute', '--dim', '--faint', '--ink-ghost', '--rule', '--line', '--edge',
    '--edge-lit', '--chip', '--field', '--gold', '--gold-dim', '--gold-lit', '--on-gold', '--bad',
    '--good', '--warn', '--you-rule', '--speak-rule', '--chrome', '--m-coop', '--m-woven', '--m-woven-ink',
    '--chrome-ink', '--chrome-dim', '--chrome-line', '--src-local', '--src-remote'];
  // --head, --dock and --panel-line came out of this list AND out of themeVars on 2026-09-05,
  // together, because no rule in app.html or web/ ever named one of them. Taking a name out of
  // here alone would be the bad half of the change: this list is what makes nine themes agree, so
  // a token still computed and no longer required is one a new theme may silently omit.
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
    // ACCENTED PROSE (2026-10-29) is body text, so it has to read as body text does. Grimdark's
    // own accent is 4.39:1 on its paper, which is why these are derived and not the accent itself.
    for (const k of ['--accent-said', '--accent-soft']) {
      const a = ratio(String(v[k] ?? ''), (spec as any).paper);
      assert.ok(a >= 4.5, `ACCENT-CONTRAST: ${name}'s ${k} is ${a.toFixed(2)}:1 against its own paper`);
    }
    assert.notStrictEqual(v['--accent-soft'], v['--accent-said'], `ACCENT-CONTRAST: ${name}'s emphasis is a softer tint, not the same colour`);
    // SMALL TEXT ON EVERY GROUND (UX review, 2026-10-29). "hold to talk", "on this machine" and the
    // help marks are 11px in `--faint` or `--dim`, which measured 3.70:1 on grimdark's sheet. The
    // page, the drawer and the menu are three grounds, so each token is checked on all three.
    for (const k of ['--label', '--mute', '--dim', '--faint'])
      for (const ground of ['paper', 'sheet', 'rail']) {
        const s = ratio(v[k], (spec as any)[ground]);
        assert.ok(s >= 4.5, `SMALL-CONTRAST: ${name}'s ${k} is ${s.toFixed(2)}:1 on its ${ground}`);
      }
    // AND THE FAINT ONES STAY FAINTER than a label, or the lift has made them body text.
    assert.ok(ratio(v['--faint'], (spec as any).paper) < ratio(v['--label'], (spec as any).paper),
      `SMALL-CONTRAST: ${name}'s --faint is no fainter than its --label`);
    // THE WOVEN CHIP IS 11px TEXT, and its bar's colour was searched for at the 3:1 a line needs
    // (2.67:1 on parchment under the chip's opacity). The words wear `--m-woven-ink`.
    for (const ground of ['paper', 'sheet']) {
      const s = ratio(v['--m-woven-ink'], (spec as any)[ground]);
      assert.ok(s >= 4.5, `WOVEN-INK: ${name}'s Woven chip is ${s.toFixed(2)}:1 on its ${ground}`);
    }
    // WOVEN (2026-10-29) is a mark down the margin, so 3:1 on the paper, and it must be none of the
    // press accents: at least 70 apart (RGB distance) from each of the six and from the speech accent.
    const w = rgb(v['--m-woven']);
    assert.ok(ratio(v['--m-woven'], (spec as any).paper) >= 3, `WOVEN-CONTRAST: ${name}'s Woven bar reads on its paper`);
    for (const k of ['--m-speak-ink', '--m-act-ink', '--m-direct-ink', '--m-narrate-ink', '--m-continue', '--m-coop', '--accent-said']) {
      const o = rgb(String(v[k]));
      const d = Math.hypot(w![0] - o![0], w![1] - o![1], w![2] - o![2]);
      assert.ok(d >= 70, `WOVEN-APART: ${name}'s Woven bar is only ${Math.round(d)} from ${k}`);
    }
  }
  ok('every theme one row, every token derived from it, every hint above 4.5:1; a removed theme reads as one that is left');

  // #53 · THE TWO SOURCE COLOURS. Each must read on the rail and on the side panel, where the
  // circles sit, at 3:1 (the floor for a mark that is not text), and the two must be far apart in
  // hue, or local and remote look alike in that theme. Hue is read off the colour itself, not off
  // how themeVars derived it.
  const hue = (c: string) => {
    const [r, g, b] = rgb(c)!.map((x) => x / 255);
    const hi = Math.max(r, g, b), d = hi - Math.min(r, g, b);
    if (!d) return NaN;
    const h = hi === r ? ((g - b) / d) % 6 : hi === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  };
  for (const [name, spec] of Object.entries(THEMES)) {
    const v: any = themeVars(name);
    for (const k of ['--src-local', '--src-remote'])
      for (const ground of ['rail', 'sheet']) {
        const r = ratio(v[k], (spec as any)[ground]);
        assert.ok(r >= 3, `${name}: ${k} is ${r.toFixed(2)}:1 on the ${ground}, under the 3:1 a circle needs`);
      }
    const gap = Math.abs(hue(v['--src-local']) - hue(v['--src-remote']));
    assert.ok(Math.min(gap, 360 - gap) >= 90,
      `${name}: local and remote are ${Math.min(gap, 360 - gap).toFixed(0)} degrees apart in hue, too close to tell apart`);
  }
  ok('the local and remote circles read on the rail and the panel, and differ in hue, in every theme');
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
    { id: 's-1', title: 'Sutera', status: 'in_progress', proposed: 1, unpaid: 2 },
    { id: 's-2', title: 'The Salt Ledger', status: 'in_progress', proposed: 4, unpaid: 0 },
    { id: 's-3', title: 'Put Away', status: 'archived', proposed: 9, unpaid: 9 },
  ];
  const w = waiting(shelf);
  // Open strings are not waiting on anyone (2026-10-29): only chalked threads light the glow.
  assert.deepStrictEqual(w.map((x: any) => x.label), ['5 threads chalked'],
    'GLOW-NO-STRINGS: it counts chalked threads across books, and not open strings');
  assert.deepStrictEqual(waiting([{ id: 's', title: 'x', status: 'in_progress', proposed: 0, unpaid: 3 }] as any), [],
    'GLOW-NO-STRINGS: a tale with only strings in play owes nothing');

  // One press has to go where the work is. Sending you to a list of places the work might be is
  // the thing this replaces.
  assert.strictEqual(w[0].storyTitle, 'The Salt Ledger', 'the book with the most of them wins the link');

  // Archiving is the act that means stop showing me this. A strip that then nags about its unpaid
  // promises has not listened — nine of each are in the archived book and none of them are counted.
  assert.ok(!w.some((x: any) => x.total > 5), 'an archived book is not counted at all');

  assert.deepStrictEqual(waiting([]), [], 'an empty shelf owes nothing');
  assert.deepStrictEqual(waiting([{ id: 's', title: 'x', proposed: 0, unpaid: 0 }] as any), [],
    'and a shelf with nothing outstanding shows no strip rather than three zeroes');
  ok('the shelf says what is waiting, per kind, in the book it is waiting in');

// ---- ARCHIVED BOOKS GET THEIR OWN END OF THE SHELF (2026-08-31). Seth: "archived stories should be
// visually different and set under a different header calling it out as archived." They were already
// sorted last and already drawn dimmed; what was missing is that a dimmed card at the end of one
// grid still reads as part of the shelf.
{
  click({ leave: '1' });
  await sleep(40);
  const page = html('page');
  // The SECTION, by its own hook — not the word "Archived", which storyCard already prints as the
  // status badge on the card itself. Matching the word passed with the split disabled.
  const head = page.indexOf('data-shelf="archived"');
  const put = page.indexOf('The Drowned Almanac');
  const live = page.indexOf('The Ashfall Concordat');
  assert.ok(head > 0, 'the shelf opens an archived section when a book is put away');
  // ORDER, not mere presence: the header has to come BEFORE the archived book and AFTER the live
  // ones, or "it says Archived somewhere on the page" would pass with the book still in the grid.
  assert.ok(live < head && head < put,
    `the live books come first, then the Archived header, then the book put away `
    + `(live ${live}, header ${head}, archived ${put})`);
  ok('archived books sit under their own header at the end of the shelf');



// ---- A WORLD BOOK IS NOT A BOOK WITH WORK IN IT (2026-08-31). It is a story with `is_world` set,
// so without the filter it would be counted like any other. Given MORE waiting than the real book,
// so a filter that failed would name the world book and this could not pass by accident.
{
  const { waiting: w } = await import('../web/model.js');
  const rows: any[] = [
    { id: 's-real', title: 'A Real Book', status: 'in_progress', proposed: 1, unpaid: 1 },
    { id: 's-w', title: 'The Tessellate', status: 'in_progress', proposed: 9, unpaid: 9,
      is_world: 1 },
  ];
  const out = w(rows);
  assert.ok(!out.some((x: any) => x.storyId === 's-w'),
    'the waiting strip never points at a world book, even when it carries the higher count');
  assert.deepStrictEqual(out.map((x: any) => x.total), [1],
    "and the world book's nine of each are not added in");
  ok('a world book is not counted as a book with work waiting in it');
}

// ---- WHAT IS NEW ON THE WORKBENCH (Seth, 2026-10-29: "we need a notification in the header for when
// the Workbench has new additions"). A card is new when any part of it was not on the Workbench the
// last time the writer opened it. The cards are the shapes deckCards() makes: a chalked group keyed
// by its joined ids, a hemmed scene by its scene, a string or an upkeep card by its own key.
// THE MENU'S WORKBENCH COUNT IS THE WORKBENCH'S CARDS (Seth, 2026-10-29: "make the menu count match
// the header"). It counted proposals one by one plus open strings, and left out hem and upkeep cards.
{
  click({ open: 's-1' });
  await sleep(40);
  click({ panel: 'waiting' });
  await sleep(30);
  const cards = (html('sideBody').match(/data-deckcard="/g) ?? []).length;
  const shown = Number((html('rail').match(/class="tnum navcount">(\d+)</) ?? [])[1] ?? 0);
  assert.ok(cards > 0, `MENU-COUNT: the fixture has cards on the Workbench (${cards})`);
  assert.strictEqual(shown, cards, `MENU-COUNT: the menu shows the Workbench's own card count (${shown} vs ${cards})`);
  ok("the menu's Workbench count is the number of cards on the Workbench");
}

{
  const { benchParts, benchUnseen } = await import('../web/model.js');
  const cards: any[] = [
    { kind: 'hem', key: 'scene:c1', ps: [{ id: 'p1' }] },
    { kind: 'chalk', key: 'p2,p3,p4', ps: [{ id: 'p2' }, { id: 'p3' }, { id: 'p4' }] },
    { kind: 'string', key: 's1' },
    { kind: 'upkeep', key: 'stale:c2' },
  ];
  const seen = new Set(benchParts(cards));
  assert.strictEqual(benchUnseen(cards, seen), 0, 'everything on the bench when it was opened is seen');
  assert.strictEqual(benchUnseen(cards, new Set()), 4, 'and with nothing seen, every card is new');

  // Sewing p2 in leaves a group keyed "p3,p4". That is not an addition, so it must not count.
  const after = [cards[0], { kind: 'chalk', key: 'p3,p4', ps: [{ id: 'p3' }, { id: 'p4' }] }, cards[2], cards[3]];
  assert.strictEqual(benchUnseen(after, seen), 0, 'a chalked group that lost a part is not new');

  // A hemmed scene the writer saw while it ran, that has since chalked something, IS new.
  const hemmed = [{ kind: 'hem', key: 'scene:c1', ps: [{ id: 'p1' }, { id: 'p9' }] }, ...cards.slice(1)];
  assert.strictEqual(benchUnseen(hemmed, seen), 1, 'a hemmed scene with a new suggestion counts once');

  const more = [...cards, { kind: 'string', key: 's2' }, { kind: 'chalk', key: 'p7', ps: [{ id: 'p7' }] }];
  assert.strictEqual(benchUnseen(more, seen), 2, 'two cards added since the last look count as two');
  ok('the Workbench mark counts the cards added since the writer last opened it');
}

// ---- PICKING A MODEL DOES NOT OPEN ITS PANEL UNDER THE MENU (2026-08-31). Seth: "when selecting a
// model the option to select it and its information is hidden behind the menu to view the models."
// The press comes from the rail's own list, and every `data-nav` row has closed the rail on overlay
// widths for as long as the rail has been one. This one did not.
{
  const wide = (globalThis as any).matchMedia;
  (globalThis as any).matchMedia = () => ({ matches: true, addEventListener() {} });   // phone width
  try {
    const rootNow = (globalThis as any).document.documentElement;
    // `data-rail` TOGGLES, so one click is not "open" — it is "the other one". The first version of
    // this pressed once, closed an already-open rail, and then passed with the fix deleted. The
    // precondition is asserted for that reason: a test whose setup silently failed reports the
    // thing it was watching for as fixed.
    if (rootNow.dataset.uiRail !== 'open') click({ rail: '1' });
    assert.strictEqual(rootNow.dataset.uiRail, 'open', 'the rail is open before a model is picked');
    click({ modelinfo: 'Qwen3.6-WNTH-35B-A3B-NN' });
    assert.strictEqual(rootNow.dataset.uiRail, 'closed',
      'the rail shuts when a model is picked from it, or the panel opens underneath the menu');
  } finally { (globalThis as any).matchMedia = wide; }
  ok('picking a model from the rail closes the rail behind it');

// ---- HOLD BACK, IN THE COMPOSER (2026-08-31). Seth: "allow that option to be toggleble in the
// input bar as a faded or unfaded option in the input bar beside threads so i dont have to enter
// all these menus." It is a per-scene decision that lived three panels deep.
{
  const open = async () => { click({ open: 's-1' }); await sleep(40); };
  const dock = () => html('dockCol');

  // NAMED NOBODY, NO CONTROL. A switch for a setting you have not made is a control with no
  // meaning, and this is the assertion that catches it appearing for every book.
  STORY.story.lockedCharacter = null;
  await open();
  assert.ok(!/data-holdback/.test(dock()), 'no locked character, no Hold back in the composer');

  STORY.story.lockedCharacter = 'Aldis Fen';
  STORY.story.lockoutOn = true;
  await open();
  assert.match(dock(), /data-holdback="0"/,
    'named and held: the button offers to LET GO, so pressing it turns the lockout off');
  assert.match(dock(), /aria-pressed="true"/, 'and reads as on');

  STORY.story.lockoutOn = false;
  await open();
  assert.match(dock(), /data-holdback="1"/, 'let go: the button offers to hold them back again');
  // DIM INK IS THE OFF STATE, and the SHAPE stays. Seth asked for "a faded or unfaded option in
  // the input bar" on 2026-08-31 and it was drawn at 42% opacity; on 2026-09-02, with two pills
  // beside it, he asked for it to be "shaped as a button so it doesnt get lost dimmed when not in
  // use" — a control you can see and cannot read is not better than no control. So the pill is in
  // the stylesheet and unconditional, and what the state changes is the ink.
  assert.match(dock(), /color:var\(--faint\)/, 'and it is drawn in the faint ink');
  assert.ok(!/opacity:\.42/.test(dock()),
    'and NOT at 42% opacity, which is what made it disappear beside the dials');
  ok('Hold back sits in the composer, faded when off, and only when the book names someone');
}

// ---- THE CREATE SCREEN (2026-08-31). Seth: "the what comes back in create a story needs to be
// removed. the paste as json needs to be hidden under a toggle or a button that opens that option."
{
  click({ leave: '1' });
  click({ railview: 'workspace' });
  await sleep(40);
  click({ nav: 'create' });
  await sleep(40);
  // The screen is the one we think it is, asserted before anything is read off it: the two
  // absence checks below would both pass on a blank page.
  assert.match(html('page'), /id="idea"/, 'the create screen is open');
  const shut = html('page');
  assert.ok(!/What comes back/.test(shut),
    'the empty What comes back panel is gone from the create screen');
  // The BOX, not the button: the door has to be there and the JSON field behind it.
  assert.ok(!/data-bookpaste/.test(shut), 'and the JSON paste box is not on screen by default');
  assert.ok(/data-forgehere/.test(shut), 'but the door that opens it is');

  click({ forgehere: '1' });
  const open = html('page');
  assert.ok(/data-bookpaste/.test(open), 'pressing it opens the paste box');
  click({ forgehere: '' });
  assert.ok(!/data-bookpaste/.test(html('page')), 'and pressing it again shuts it');
  ok('create offers the paste behind a door, and no longer describes itself in an empty panel');
}
}
}

// WHAT IS OWED, ON THE HERO (v3, 2026-10-25). The chips that said "2 threads basted" beside the book
// came off with Seth's "simplify it to match the design"; a gold dot on Carry on writing says the
// tale owes something, and the button's label says what, by kind and with the real count.
{
  click({ leave: '1' });
  await sleep(40);
  const page = html('page');
  // 2026-10-29 (Seth: "the button can be removed, let's just tap the square to enter"): the whole
  // hero is the one door, and it is a real button so a keyboard reaches it.
  const go = /<button class="art" data-open="s-1"([^>]*)>/.exec(page);
  assert.ok(go, 'HERO-TAP: the whole hero is the press that opens the tale');
  assert.doesNotMatch(page, /class="btn bandgo"/, 'HERO-TAP: and there is no separate button on it');
  assert.match(go![1], /aria-label="Open [^"]*\. Waiting: 2 threads chalked, 1 string not tied off"/,
    'its label says what is owed, by kind, with the real count, singular as singular');
  assert.match(page, /<section class="resumeband[\s\S]*?class="owedot(?: [^"]*)?"/, 'and the hero carries the dot');
  // GENRE ON THE LEFT, WORDS ON THE RIGHT, on the glass card under the last line.
  assert.match(page, /<span class="herometa"><span>[^<]*<\/span><span>[\d,]+ words?<\/span><\/span>/,
    'HERO-META: the genre on the left and the words on the right');
  assert.doesNotMatch(page, /data-owed=|data-readfrom=/, 'the chips and Read from scene one are gone from the rack');
  // THE COST, WRITTEN DOWN, as before: a tale that is not the hero says nothing about what it owes.
  assert.ok(!/class="owedot/.test(page.slice(page.indexOf('</section>'))), 'a tale that is not the hero has no dot');
}
ok('what is owed is a dot on the hero\'s Carry on, and its label says what');
}

// The webs and their prose, kept in step. This is the check that fails when somebody adds a help
// icon and forgets to write the text, or renames a control and orphans its entry — which is the
// only way this stays true, because nothing else about it can be verified by reading the code.
{
  const { HELP } = await import('../web/help.js');
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

  // `helpText` joined the two on 2026-09-03: a field with a web AND a sentence of its own draws
  // both into one card, so that is a third way a slug is used and a scan that missed it would
  // report a live web as orphaned.
  const used = new Set([...src.matchAll(/help(?:Mark|Body|Text)?\('([a-z]+)'\)/g)].map((m) => m[1]));
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
  const { bookParagraphs, inkParagraphs, accent, esc } = await import('../web/model.js');
  // STREAMED AS IT WILL LAND (2026-10-27): word by word through inkParagraphs gives the same
  // paragraphs bookParagraphs gives the finished passage, so nothing reflows when it lands.
  {
    const mk = (tag: string): any => { const o: any = { tagName: tag.toUpperCase(), kids: [] as any[], dataset: {},
      _t: '', _h: null as string | null, append(c: any) { o.kids.push(c); },
      get children() { return o.kids; }, get lastElementChild() { return o.kids.at(-1) ?? null; },
      // What a browser would show: the markup's text with its tags gone and its entities read.
      get textContent() { return o.kids.length ? o.kids.map((k: any) => k.textContent).join('')
        : o._h == null ? o._t : o._h.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); },
      set textContent(v: string) { o._t = v; o._h = null; },
      get innerHTML() { return o.kids.length ? o.kids.map((k: any) => k.innerHTML).join('') : o._h ?? esc(o._t); },
      set innerHTML(v: string) { o._h = v; } }; return o; };
    const doc = { createElement: mk };
    const streamed = (body: string) => {
      const el = mk('div');
      for (const w of body.match(/[^ ]+ ?| /g) ?? []) inkParagraphs(el, w, doc);
      return el.kids.map((p: any) => p.textContent.trim());
    };
    for (const body of ['She crossed the room. "You came," he said. The rain kept on.',
                        'The door shut.\n\nNobody moved.\nThen the lamp went out.',
                        'The sign said "closed", so she left. "Wait," he called.\n\n"No."'])
      assert.deepStrictEqual(streamed(body), bookParagraphs(body), `STREAM-PARAS: streamed like it lands: ${JSON.stringify(body)}`);

    // ACCENTED AS IT WILL LAND (2026-10-29). Two pieces of markup look the same if they differ only where a word ended: a tag closed at
    // the end of one word and opened again at the start of the next, or the space a streamed
    // paragraph keeps after its last word.
    const looks = (h: string) => {
      let prev;
      do { prev = h; h = h.replace(/<\/(em|strong)><\1>/g, '').replace(/<\/span><span class="q">/g, ''); } while (h !== prev);
      return h.replace(/\s+((?:<\/[^>]+>)*)$/, '$1');
    };
    const body = 'She didn\'t cross the room. "You came *all this way*," he said. **Nobody else** moved. 5 * 3 is *fifteen.\n\n'
      + '“I was *never once* here.\n\n“Not once,” she said.';
    const landed = ['She didn&#39;t cross the room.',
      '<span class="q">&quot;You came <em>all this way</em>,&quot;</span> he said. <strong>Nobody else</strong> moved. 5 * 3 is *fifteen.',
      '<span class="q">“I was <em>never once</em> here.</span>',
      '<span class="q">“Not once,”</span> she said.'];
    // The page draws exactly this (passageHTML's own call), written out by hand above.
    assert.deepStrictEqual(accent(bookParagraphs(body).map(esc).join('\n')).split('\n'), landed,
      'STREAM-ACCENT: the landed passage, accented');
    const el = mk('div');
    const shown: string[] = [];
    for (const w of body.match(/[^ ]+ ?| /g) ?? []) {
      inkParagraphs(el, w, doc);
      shown.push(el.kids.map((p: any) => p.textContent).join('\n'));
    }
    assert.deepStrictEqual(el.kids.map((p: any) => looks(p.innerHTML)), landed,
      'STREAM-ACCENT: word by word, the passage being written ends as the landed one looks');
    // AND NO ASTERISK FLASHES. Every one that the landed passage hides is hidden from the moment
    // its word arrives. The two that stay (5 * 3, and the unclosed *fifteen) are the only ones
    // ever seen, and the second only once the next paragraph starts and it is known to have no
    // closer: an unmatched mark is the one case that changes while the passage is written.
    const stars = shown.map((s) => (s.match(/\*/g) ?? []).length);
    assert.ok(stars.every((c, i) => c <= 2 && (i === 0 || c >= stars[i - 1])),
      `STREAM-ACCENT: no asterisk is shown and then hidden while a passage is written (${stars.join(',')})`);
  }
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

// ACCENTED PROSE (2026-10-29). Seth: "things between quotations or asterisks or double asterisks
// should be accented". `accent` takes ESCAPED text and returns it marked up. Every expected string
// below is written out by hand, never built the way the code builds it.
{
  const { accent, esc } = await import('../web/model.js');
  const Q = '<span class="q">';
  const cases: [string, string, string][] = [
    // [name, raw text, expected HTML]
    ['curly quotes', 'She said “Run.” and left.', `She said ${Q}“Run.”</span> and left.`],
    ['straight quotes', 'He said "Run." Then.', `He said ${Q}&quot;Run.&quot;</span> Then.`],
    ['a straight quote mid-sentence', 'The sign said "closed", so she left.', `The sign said ${Q}&quot;closed&quot;</span>, so she left.`],
    ['double asterisks', 'She said **stop** twice.', 'She said <strong>stop</strong> twice.'],
    ['single asterisks', 'a *soft* word', 'a <em>soft</em> word'],
    ['emphasis inside a quote', '“I *said* no.”', `${Q}“I <em>said</em> no.”</span>`],
    ['strong inside a quote, straight', '"Get **out**," he said.', `${Q}&quot;Get <strong>out</strong>,&quot;</span> he said.`],
    ['emphasis around a quote', '*“Now,”* she said.', `<em>${Q}“Now,”</span></em> she said.`],
    ['an unclosed quote stays literal', '“Wait. She left. The end', '“Wait. She left. The end'],
    ['an unclosed quote does not swallow the next one', '“Wait. Then “Go,” he said.',
      `“Wait. Then ${Q}“Go,”</span> he said.`],
    ['a stray closing quote stays literal', 'He was 6" tall.', 'He was 6&quot; tall.'],
    ['an unclosed asterisk stays literal', '*Wait and go home.', '*Wait and go home.'],
    ['an unclosed double asterisk stays literal', 'It was **loud and long.', 'It was **loud and long.'],
    ['an asterisk between spaces', '5 * 3 = 15', '5 * 3 = 15'],
    ['two of them between spaces', '5 * 3 * 2 = 30', '5 * 3 * 2 = 30'],
    ['a lone asterisk', 'Then * nothing.', 'Then * nothing.'],
    ['asterisks inside a word', 'snake*case*name', 'snake*case*name'],
    ['an asterisk after a letter does not open', 'file*name* here', 'file*name* here'],
    ['three asterisks', 'A ***scene*** break', 'A ***scene*** break'],
    ['apostrophes are not quotes', 'Don\'t. “It’s mine,” she said. ‘Fine.’',
      `Don&#39;t. ${Q}“It’s mine,”</span> she said. ‘Fine.’`],
    ['a quote that runs on to the next paragraph', '“First part.\n“Second part.”',
      `${Q}“First part.</span>\n${Q}“Second part.”</span>`],
    ['an unclosed quote before narration stays literal', '“First.\nShe left.', '“First.\nShe left.'],
    // Escaping and marking compose: the six characters &quot; in the text are not a quote.
    ['the text &quot; is not a quote', 'It said &quot;hi&quot; there', 'It said &amp;quot;hi&amp;quot; there'],
    ['a tag inside emphasis stays text', '<b>*x*</b>', '&lt;b&gt;<em>x</em>&lt;/b&gt;'],
  ];
  for (const [name, raw, want] of cases)
    assert.strictEqual(accent(esc(raw)), want, `ACCENT: ${name}`);

  // NO INJECTION: whatever goes in, the only tags out are the four this function writes.
  for (const raw of ['"<img src=x onerror=alert(1)>" **<script>alert(1)</script>**',
                     '*"\'><svg onload=alert(1)>*', '“&lt;b&gt;” **&amp;** *&quot;*']) {
    const out = accent(esc(raw));
    assert.doesNotMatch(out.replace(/<\/?(em|strong)>|<span class="q">|<\/span>/g, ''), /[<>"]/,
      `ACCENT-SAFE: no markup gets through from ${JSON.stringify(raw)}`);
  }

  // WHILE A PASSAGE IS BEING WRITTEN its last paragraph is not finished, so what is open is shown
  // open: the asterisk is already hidden and the words already styled before the closer arrives.
  assert.strictEqual(accent(esc('“I was *going'), { done: false }), `${Q}“I was <em>going</em></span>`,
    'ACCENT-OPEN: an unfinished paragraph keeps its quote and emphasis open');
  assert.strictEqual(accent(esc('*One.\nTwo *three'), { done: false }), '*One.\nTwo <em>three</em>',
    'ACCENT-OPEN: only the last paragraph is unfinished');
  ok(`quoted speech and asterisk emphasis are accented, safely (${cases.length} cases)`);
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
  await sleep(40);   // the page paints after its stats call is queued
  const page = html('page');
  assert.doesNotMatch(page, /llama-server/, 'the server address is gone');
  assert.doesNotMatch(page, /data-router=/, 'and the restart and stop controls with it');
  assert.doesNotMatch(page, /data-pickmodel=/,
    'and the second copy of the model list — the rail footer has the one that stays');
  assert.match(page, /What you have written/, 'the writing record is what the page is now');
  // The slot, the canon cap and the snapshot button are the machine's, not the writer's: since
  // 2026-10-24 only the admin sees them. This fixture's writer is not the admin.
  assert.doesNotMatch(page, /data-backup=|Canon cap|Context per writer/,
    'ADMIN-ONLY: a writer who is not the admin is not shown the machine');
  ok('Preferences is a writing record: the operator console is gone, and the machine is the admin\'s');

  // ---- AND THE RECORD ITSELF. Seth, 2026-09-03: "We need to make these stats better and see if we
  // can add more. this is a really nice panel i want to take more advantage of."
  //
  // Until the fixture above, `/api/stats` fell through to `{}` and every one of these rows rendered
  // from nothing — the page had a check that it was not an operator console and no check at all on
  // the thing it IS. That is the first rule about measurement in this repo: validate the detector.
  //
  // THIRTY BARS FROM TWO ROWS is the assertion that carries the most. The server sends only days
  // that have passages, so the chart used to stand two dates nine days apart next to each other and
  // read as an unbroken run — and on a library whose passages all landed on one date the old
  // `days.length > 1` guard drew no chart at all.
  const bars = (page.match(/ words in \d+ passages?"/g) ?? []).length;
  assert.strictEqual(bars, 30,
    `the chart is a thirty-day frame with the empty days in it — drew ${bars} bars from 2 rows`);
  assert.match(page, /Days written/, 'and it says how many of them were written on');
  assert.match(page, />2 of 30</, 'two of thirty, counted off the frame and not off the rows');

  // THE DENOMINATOR, which is this project's second rule about measurement: "11 takes not chosen"
  // cannot be read without knowing how many were written. 17 kept + 11 not = 28, and 11/28 is 39%.
  assert.match(page, /39% of the 28 written/,
    'takes not chosen is reported against the number of takes there were');

  // The ledger broken out by kind, from the server rather than guessed at from the total.
  assert.match(page, /9 Characters/, 'the threads row says what kind they are');
  assert.match(page, /6 Lore/, 'all of the kinds, in the order the server sent');

  // The MIDDLE call and not the mean one — a cold reload drags an average and says nothing.
  assert.match(page, /10\.4s/, 'and how long a call takes in the middle');
  assert.match(page, /half were faster, half slower/, 'said as what it is, so it cannot be misread');
  ok('the writing record counts thirty days including the empty ones, and reports its denominators');
}

// NEW THREAD (v2 redesign, 2026-10-25). One box for a name or a pasted thread, the four kinds as a
// choice with Character lit, Write it, and Anansi's three cards. The pockets that #27 put in the old
// tray are added from the thread itself now, so no pocket is offered here.
{
  click({ open: 's-1' });
  await sleep(40);
  click({ panel: 'threads' }); click({ newlore: '1' });
  const first = html('sideBody');
  assert.match(first, /New thread/, 'the screen is called New thread');
  assert.match(first, /id="newname"[^>]*placeholder="Name it, or paste one in"/, 'one box, for a name or a paste');
  // #80 adds Places; #75 moves Rules onto the tale's own thread, so New thread does not offer one.
  for (const k of ['character', 'place', 'lore', 'item'])
    assert.match(first, new RegExp(`data-lorekind="${k}"`), `the kinds are offered (${k})`);
  assert.doesNotMatch(first, /data-lorekind="rule"/, 'and a rule is added from the tale\'s own thread');
  assert.match(first, /data-lorekind="character" aria-pressed="true"/, 'Character is lit until another is chosen');
  assert.doesNotMatch(first, /data-lorekind="(facts|interiority|voice|outfit|who_is_here)"/, 'and no pocket is offered');
  assert.match(first, /data-newthread="character"/, 'Write it writes the lit kind');
  for (const [k, v] of [['invent', 'character'], ['fromweb', 'character'], ['loreread', '1']])
    assert.match(first, new RegExp(`class="letcard" data-${k}="${v}"`), `Anansi's card: ${k}`);
  assert.doesNotMatch(first, /data-pastebox|data-pastethread/, 'the paste box is gone into the one box');

  click({ lorekind: 'item' });
  const second = html('sideBody');
  assert.match(second, /data-lorekind="item" aria-pressed="true"/, 'a kind pressed is lit');
  assert.match(second, /data-newthread="item"/, 'and Write it writes it');
  assert.match(second, /data-invent="item"/, 'and so does Write one for me');
  assert.match(second, /data-fromweb="item"/, 'and Look it up online');
  assert.doesNotMatch(second, /data-lorekind="scope"/, 'a kind still offers no pockets');
  click({ lorekind: 'outfit' });
  assert.match(html('sideBody'), /data-lorekind="item" aria-pressed="true"/, 'a word that is not a kind changes nothing');
  click({ newlore: '1' });   // shut it again: the blocks below open it by the same toggle
  assert.doesNotMatch(html('sideBody'), /id="newname"/, 'the same press shuts it');
  ok('New thread offers one box, the four kinds as a choice, Write it, and three cards that write the lit kind');
}

// #22. The cross-shelf Threads page: one book open, the rest collapsed, and cards that do not
// stretch their row. `db.ledgerOf` already orders by `s.updated_at DESC`, so [0] is the book you
// were last writing in — the ordering was never the problem, the twelve grids at once were.
{
  // Back to the workspace first: `data-nav` is the workspace rail, and the block above this one
  // opened a story, where the rail is `data-panel` instead. A nav click inside a story does nothing
  // and the page stays whatever it was — which is how this read as a rendering bug for a minute.
  click({ railview: 'workspace' });
  await sleep(40);
  click({ nav: 'canon' });
  // The page paints "Reading the threads…" first and fetches; loadLedger repaints when it lands.
  for (let i = 0; i < 20 && !/data-lbook=/.test(html('page')); i++) await sleep(25);
  const page = html('page');
  assert.match(page, /data-lbook=/, 'every book is a heading you can press');
  assert.match(page, /class="clamp3(?: [^"]*)?"/,
    'and a long thread does not stretch its row — the body is clamped in the selectable view');

  // #22 §3. ONE TOGGLE FOR THE WHOLE PANEL, and it opens on the book you were last writing in.
  // The page used to span the shelf whatever you wanted, which is the wall this issue is about.
  assert.strictEqual((page.match(/data-lbook=/g) ?? []).length, 1,
    'it opens on ONE book — the one you were last writing in');
  assert.match(page, /data-lookall="1"/, 'with the shelf one press away');
  // THREE since 2026-08-31, when a world book joined the ledger fixture so the hero-banner
  // assertions at the foot of this file have a world book to open. The number is the count of
  // books with cards in them, so adding one to the fixture is meant to change it.
  assert.match(page, /All 3 tales/, 'and the press says how many books that is');

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
  // ADR 0004: a picked chip is bright ink and a rule, not gold.
  const picked = (h: string) => (h.match(/data-lslot="([^"]*)"[^>]*border:1px solid var\(--ink-bright\)/) ?? [])[1];
  click({ lslot: 'voice' });
  assert.strictEqual(picked(html('page')), 'voice', 'the room chip takes the selection');
  click({ lkind: 'item' });
  const rules = html('page');
  assert.strictEqual(picked(rules), '',
    'and changing kind puts it back on Any room — a filter left on from a kind you are no longer '
    + 'looking at is a page that shows nothing for no visible reason');
  assert.match(rules, /data-lslot="what_it_does"/, 'while the new kind offers its own rooms');
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
  for (let i = 0; i < 20 && !/words a second/.test(html('sideBody')); i++) await sleep(25);

  // THE WRITER'S VIEW FIRST. The usability check of 2026-10-24 scored this page 1 of 5: tokens,
  // tok/s, the raw id, the router's preset file and the bakeoff notes. A writer who is not the admin
  // gets words and a speed in words; the machine's details are the admin's, asserted below.
  const mine = html('sideBody').replace(/<!--[\s\S]*?-->/g, '');
  assert.match(mine, /about 38,000 words/, 'WRITER-MODEL: how much it reads, in words');
  assert.match(mine, /about 44 words a second/, 'WRITER-MODEL: how fast, in words');
  // On screen, so the tags come off first: the switch carries the id in its attribute, and should.
  assert.doesNotMatch(mine.replace(/<[^>]*>/g, ' '), /tokens|tok\/s|preset file|Qwen3\.6-WNTH-35B-A3B-NN|bakeoff|twelve times/,
    'WRITER-MODEL: and none of the machine talk');
  assert.match(mine, /data-pickmodel="Qwen3\.6-WNTH-35B-A3B-NN"/, 'WRITER-MODEL: with the switch');
  click({ modelinfo: 'write-nt-qwen36-h' });
  // #131. The others are the rows around it on the same tab, so it needs no press of its own.
  assert.match(html('sideBody'), /<button data-tellerlist="usual"/,
    'WRITER-MODEL: and the info sits on Model, under the row that opens the others to choose from');

  libAdmin = true; click({ home: 1 });
  await sleep(40);
  click({ modelinfo: 'Qwen3.6-WNTH-35B-A3B-NN' });
  for (let i = 0; i < 20 && !/tokens a second/.test(html('sideBody')); i++) await sleep(25);

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
  assert.match(panel, /100,096 shared 2 ways in the router.{0,6}s preset file/,
    'with which of the four sources it came from beside it');
  assert.match(panel, /58\.4 tokens a second/, 'measured here, not claimed');
  assert.match(panel, /about 44 words a second/, 'CONTEXT-WORDS: and in words');
  assert.match(panel, /the middle of 58 passages/);
  assert.doesNotMatch(panel, /too few to be sure of/, 'fifty-eight calls is not a thin sample');
  assert.match(panel, /How much he reads at once \(context\)/, 'CONTEXT-WORDS: the context is named as the context');
  // A UX review on 2026-10-29 read "about 38,000 words &middot; 50,048 tokens" on this page: the
  // value carried an entity and `fact` escaped it a second time.
  assert.doesNotMatch(panel, /&amp;middot;/, 'FACT-DOT: the dot between words and tokens is a dot, not the entity as text');
  assert.match(panel, /words · [\d,]+ tokens/, 'FACT-DOT: words and tokens with a dot between');
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
  assert.match(loaded, /half of what this machine holds \(100,096 tokens\)/, 'and it says so');
  assert.match(loaded, /writing now/, 'and this is the one writing');
  assert.doesNotMatch(loaded, /data-pickmodel=/, 'so there is nothing to switch to');

  // The exception is an exception. A panel about a BOOK still has nothing to say with no book open.
  click({ panel: 'story' });
  assert.strictEqual(side().hidden, true, 'every other panel is still gated on a story being open');

  // A THIN SAMPLE SAYS SO. 41.2 tok/s off three calls and off two hundred are different claims.
  click({ modelinfo: 'Wayfarer-2-RPNT-12B' });
  const thin = html('sideBody');
  assert.match(thin, /the middle of 3 passages written with it here, too few to be sure of/);
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

  // A REMOTE MODEL'S PANEL SAYS WHAT IS TRUE ON FEATHERLESS. It has no router and no preset file,
  // so wording about either is wrong for it; its context limit and its unit cost come from the
  // Featherless catalogue. Comments are stripped first, so a comment cannot satisfy a match.
  const strip = (h: string) => h.replace(/<!--[\s\S]*?-->/g, '');
  const FAR = 'featherless:Grey/Kestrel-Heretic-24B';
  click({ modelinfo: FAR });
  await sleep(30);
  const far = strip(html('sideBody'));
  assert.doesNotMatch(far, /preset file/, 'REMOTE-PANEL: no preset-file wording for a remote model');
  assert.doesNotMatch(far, /router/, 'REMOTE-PANEL: and no router wording');
  assert.match(far, /32,768 tokens/, 'the room one writer gets');
  assert.match(far, /whole limit on Featherless/, 'REMOTE-PANEL: and that it is the limit Featherless gives it');
  assert.match(far, /2 units of your Featherless plan/, 'REMOTE-PANEL: its unit cost, on the writer\'s own plan');
  assert.match(far, /all of it is yours/, 'REMOTE-OWN: a Featherless model\'s room is not shared');
  assert.match(far, /on Featherless/, 'REMOTE-PANEL: and where it runs');
  assert.doesNotMatch(far, /data-pickmodel=/,
    'REMOTE-PANEL: with Featherless not set up, there is no Write with this one');

  // With a key, the switch is back. The list is read again so the panel learns it.
  modelsRemote = true;
  click({ dropshort: 'featherless:Other/Unused-12B' });
  await sleep(40);
  click({ modelinfo: FAR });
  assert.match(html('sideBody'), /data-pickmodel="featherless:Grey\/Kestrel-Heretic-24B"/,
    'and with Featherless set up, the switch is on the panel');
  modelsRemote = false;
  click({ dropshort: 'featherless:Other/Unused-12B' });
  await sleep(40);
}
libAdmin = false; click({ home: 1 });
await sleep(40);
ok('the model panel reads the router, the preset file, this database and the id, and names each');

// PICKING A MODEL IN A TALE READS THE TALE AGAIN (Seth, 2026-10-29: "when I select a new model it
// doesn't auto update it in the menu so it looks like I'm using another model"). In a tale the menu
// names `V.model`, the model the server resolved for it, which only a fresh read of the tale moves.
{
  click({ open: 's-1' }); await sleep(40);
  const was = (globalThis as any).fetch;
  let reads = 0;
  (globalThis as any).fetch = async (url: string, init?: any) => {
    if (url === '/api/model') return { ok: true, status: 200, json: async () => ({ active: 'featherless:Grey/Kestrel-Heretic-24B' }) };
    if (String(url).startsWith('/api/story?')) reads++;
    return was(url, init);
  };
  try {
    click({ pickmodel: 'featherless:Grey/Kestrel-Heretic-24B' }); await sleep(60);
    assert.ok(reads >= 1, 'MODEL-PICK-REREAD: picking a model in a tale reads the tale again, so the menu names it');
  } finally { (globalThis as any).fetch = was; click({ home: 1 }); await sleep(30); }
}
ok('picking a model in a tale reads the tale again, so the menu names the new one');

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
  await sleep(40);

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

  // 2 · THE LIST, on Storyteller's Model tab since #131 (it dropped open under the label before).
  // Sliced from the first row to the sampler, so an assertion here cannot be satisfied by the tale's
  // picker above it — the two render the same badge string for the same model, and a check that
  // cannot tell them apart proves nothing about the one it names.
  click({ modelmenu: '1' });
  for (let i = 0; i < 20 && !/data-tellerlist="usual"/.test(html('sideBody')); i++) await sleep(25);
  click({ tellerlist: 'usual' });
  const body = visible(html('sideBody'));
  const list = body.slice(body.indexOf('data-tellerlist="usual"'), body.indexOf('data-gen='));
  assert.ok(list.length > 200, 'the list must actually be open');
  assert.match(list, BADGES, 'every row says what it is for, whether it thinks, and its tier');
  assert.match(list, /Roleplay · trained open/,
    'and a model with no H reads as trained open, never as censored');
  // Not the size, on this one: the strip is nowrap with an ellipsis, the size is the longest badge
  // and the least of what was asked for here, and it is one press away on the panel. Anchored to
  // the badge line — the raw id is in each row's own attribute and carries the size with it, so a
  // bare /35B-A3B/ could never fail.
  assert.doesNotMatch(list, /uncensored · 35B-A3B/, 'the size must not be in the badge line here');

  // 3 · THE STORYTELLER, which is where a book pins its own.
  click({ panel: 'teller' });
  await sleep(30);
  const teller = visible(html('sideBody'));
  assert.match(teller.slice(teller.indexOf('data-tellerlist="tale"')), /^[^]*?<span class="gold-line">Write · uncensored · novel tier · 35B-A3B<\/span>[^]*?What it is/,
    'the row for the model that writes this tale carries the badges, and the size fits on this one');
  assert.match(teller, /data-modelinfo="Qwen3\.6-WNTH-35B-A3B-NN"/,
    'with a door to the panel that holds the blurb, the speed and the context');
  // A row in the tale's list is built from `detail` — the badges with the size put back in,
  // one decode rather than a second list that drifts away from it. Here the tale follows the
  // writer's usual model, so that one is the row in force and the others are its list.
  click({ tellerlist: 'tale' });
  assert.match(visible(html('sideBody')), /data-talemodel="Wayfarer-2-RPNT-12B"[^>]*><span[^>]*>Wayfarer 2 — Roleplay · trained open · 12B · local/,
    'and the tale\'s list carries the same decode, size included');
  click({ tellerlist: 'tale' });

  // HOW MUCH HE READS AT ONCE, this tale's own cap (2026-10-29), in words, saved on change.
  assert.match(teller, /<select class="field" id="f-story-maxContext" data-story="maxContext">/,
    'CTX-SELECT: the Storyteller sets how much Anansi reads at once for this tale');
  assert.match(teller, /<option value="" selected>All the model holds<\/option>/, '  all of it when the tale names none');
  assert.match(teller, /<option value="16000"[^>]*>About 12,000 words<\/option>/, '  and the others in words');

  STORY.model = wasModel;
}
ok('the rail label, the rail list and the Storyteller all read the id the panel reads');

// #55. THE WEAVING SWITCH, where the "Thinking is off, and not a setting" note was. That note
// contradicts a switch, so the two cannot both be on the panel; and the writer's word is Weaving.
{
  const visible = (h: string) => h.replace(/<!--[\s\S]*?-->/g, '');
  const changeIn = (target: any) => (listeners.change ?? []).forEach((f: Function) => f({ target }));
  click({ open: 's-1' });
  await sleep(40);
  click({ panel: 'teller' });
  await sleep(30);
  const teller = visible(html('sideBody'));
  assert.doesNotMatch(teller, /Thinking is off/, 'the old note is gone');
  assert.doesNotMatch(teller, /genThinking/, 'and its tip card with it');
  const box = teller.match(/<input type="checkbox" data-story="weaving"[^>]*>/)?.[0];
  assert.ok(box, 'the panel has a weaving switch, saved as a story field');
  assert.doesNotMatch(box!, /checked/, 'off, for a book that does not weave');
  assert.match(teller, /Plans first/, 'named Plans first');
  // The tip is the trade in one sentence: slower, and it takes room from the book.
  const tip = teller.match(/id="tip-weaving"[\s\S]*?<\/p>/)?.[0] ?? '';
  assert.match(tip, /slower/i, `the tip says it is slower: ${tip}`);
  assert.match(tip, /space/i, 'and that it takes space');
  // The switch and its tip only: the model row above decodes preset ids, whose own words are
  // the model's and not this switch's.
  const label = teller.match(/<label[^>]*>\s*<input type="checkbox" data-story="weaving"[\s\S]*?<\/label>/)?.[0] ?? '';
  assert.ok(label, 'the switch has a label');
  assert.doesNotMatch(tip + label, /\b(think|thinking|reasoning|planning)\b/i,
    'and neither it nor its tip calls weaving thinking, reasoning or planning');
  // The switch sits after the book's model and before the sampler: everything about what writes
  // this book in one place.
  const at = (re: RegExp) => teller.search(re);
  assert.ok(at(/data-tellerlist="tale"/) < at(/data-story="weaving"/) && at(/data-story="weaving"/) < at(/>How he picks words</),
    'between the book\'s model and the sampler');
  // TWO HOMES ON ONE PANEL, SAID AS TWO (Seth's item 9, 2026-10-29). The panel opened on "These are
  // yours, not per tale" above a model picker that is per tale. Now "This tale" heads the model,
  // Plans first and the reading cap, and "On every tale" heads the sampler.
  assert.doesNotMatch(teller, /not per tale/, 'TELLER-HOMES: no banner that says the whole panel is not per tale');
  assert.ok(at(/>This tale</) !== -1 && at(/>This tale</) < at(/data-tellerlist="tale"/),
    'TELLER-HOMES: "This tale" heads the model');
  assert.ok(at(/data-story="maxContext"/) < at(/>On every tale</) && at(/>On every tale</) < at(/data-gen=/),
    'TELLER-HOMES: and "On every tale" comes after the tale\'s own settings and heads the sampler');
  assert.doesNotMatch(teller, /foot of the menu/, 'TELLER-HOMES: and it does not send the writer to the foot of a menu that is at the top on a phone');

  STORY.story.weaving = true;
  click({ panel: 'teller' }); click({ panel: 'teller' });
  await sleep(30);
  assert.match(visible(html('sideBody')).match(/<input type="checkbox" data-story="weaving"[^>]*>/)?.[0] ?? '',
    /checked/, 'and on, for a book that does');
  STORY.story.weaving = false;

  POSTED.length = 0;
  changeIn({ dataset: { story: 'weaving' }, type: 'checkbox', checked: true });
  await sleep(30);
  const saved = POSTED.find((p: any) => String(p.url) === '/api/story');
  assert.strictEqual(saved?.body.story.weaving, true, 'turning it on saves it to the book, with no Save pressed');
  assert.ok(POSTED.some((p: any) => String(p.url).startsWith('/api/manifest')),
    'and the Context panel asks again, because the budget just changed');
}
ok('the Storyteller has a Weaving switch where the thinking note was, and it saves itself');

// #61, #58. A BOOK WHOSE MODEL CANNOT BE ASKED TO WEAVE, OR ALWAYS WEAVES: the server sends the
// sentence to show where the switch would be (`weaveNote`), and the panel offers no switch to press.
// The sentence is the server's, so the client carries no copy of it: the fixture's words are not
// the shipped ones, and the panel must show the fixture's.
{
  const visible = (h: string) => h.replace(/<!--[\s\S]*?-->/g, '');
  const was = (STORY as any).weaveNote;
  const teller = async (note: string) => {
    (STORY as any).weaveNote = note;
    click({ open: 's-1' });
    await sleep(40);
    click({ panel: 'teller' });
    await sleep(30);
    return visible(html('sideBody'));
  };
  try {
    for (const note of ['The fixture model cannot be asked to weave.', 'This model always plans first.']) {
      const t = await teller(note);
      assert.doesNotMatch(t, /data-story="weaving"/, `WEAVE-NOTE: no switch is offered: ${note}`);
      const said = t.match(/<div[^>]*id="weavenote"[^>]*>([\s\S]*?)<\/div>/)?.[1]?.trim() ?? '';
      assert.strictEqual(said, note, 'WEAVE-NOTE: the panel shows the server\'s sentence, and no copy of its own');
      const at = (re: RegExp) => t.search(re);
      assert.ok(at(/data-tellerlist="tale"/) < at(/id="weavenote"/) && at(/id="weavenote"/) < at(/>How he picks words</),
        'where the switch would be');
    }
  } finally { (STORY as any).weaveNote = was; }
}
ok('a book whose model cannot be asked to weave, or always weaves, says so in the Storyteller, with no switch');

// #61 · A BOOK MOVED TO A MODEL THAT CANNOT TAKE THE SWITCH has its weaving turned off by the server,
// which says so in the save's `toast`; the picker shows that sentence with the model it picked.
{
  const changeIn = (target: any) => (listeners.change ?? []).forEach((f: Function) => f({ target }));
  try {
    click({ open: 's-1' });
    await sleep(40);
    (STORY as any).toast = 'Weaving is off for this book now (fixture).';
    click({ talemodel: 'featherless:someone/No-Switch' });
    await sleep(60);
    const said = String(nodes.get('toast').textContent);
    assert.match(said, /Weaving is off for this book now \(fixture\)\./, `MOVE-TOAST: the writer is told weaving went off: ${said}`);
    assert.match(said, /This tale's model is/, 'MOVE-TOAST: beside the model it picked');
    delete (STORY as any).toast;
    click({ talemodel: 'Qwen3.6-WNTH-35B-A3B-NN' });
    await sleep(60);
    assert.doesNotMatch(String(nodes.get('toast').textContent), /Weaving/, 'the control: a move that clears nothing says nothing of weaving');
  } finally { delete (STORY as any).toast; }
}
ok('a book moved to a model that cannot take the switch says its weaving went off');

// #55. "WEAVING…" AND THE SECONDS, from the press until the first word. A weaving passage measured a
// median 60 s of silence before its prose (F60), which reads as a hung app without a count. The
// composer is the half this harness can see: its stub veil has no inside to read, and the browser
// scenario test/ui/weave.js reads that one.
{
  click({ open: 's-1' });
  await sleep(40);
  let open!: () => void;
  const weaving = (STORY as any).weaves;
  try {
    // A book that does not weave says nothing of the kind while it waits.
    streamGate = new Promise<void>((r) => { open = r; });
    void click({ continue: '1' });
    await sleep(30);
    assert.doesNotMatch(html('dockCol'), /Planning/, 'a book that does not plan never says Planning');
    open(); await sleep(60);

    (STORY as any).weaves = true;
    click({ open: 's-1' });
    await sleep(40);
    streamGate = new Promise<void>((r) => { open = r; });
    void click({ continue: '1' });
    await sleep(30);
    // OFF THE BAR since 2026-10-27 (Seth: "remove the thinking from above the middle circle"). The
    // count lives in the passage being written, which this stub cannot read; test/ui/weave.js does.
    assert.doesNotMatch(html('dockCol'), /Planning/, 'nothing above the middle circle says Planning');
    let end!: () => void;
    endGate = new Promise<void>((r) => { end = r; });
    open(); await sleep(60);
    end(); await sleep(60);
  } finally { streamGate = null; endGate = null; (STORY as any).weaves = weaving; }
}
ok('a weaving book keeps its planning count off the bar above the middle circle');

// #56. WHEN WEAVING DOES NOT FIT. The server refuses a weaving passage that would leave part of the
// book out, and offers two ways on. The app had no toast that carries actions, so the refusal is a
// row on the composer: the sentence and two buttons, where the writer's hand already is. Each button
// sends the same press again — Write anyway with the override, Turn weaving off after the switch.
{
  const MSG = 'Plans first sets aside 5,000 tokens for Anansi to plan in, and in this tale that would leave '
    + 'out the 4 oldest passages still in view. Turn Plans first off for this tale, or write anyway and leave them out.';
  const refusal = (overflows = false) => ({ error: MSG, manifest: MANIFEST.manifest,
    weaveFit: { overflows, message: MSG, drops: [{ kind: 'PROSE', id: 'p-1' }] } });
  const gens = () => POSTED.filter((p: any) => String(p.url).startsWith('/api/generate'));
  const row = () => html('dockCol').match(/<div id="weavefit"[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? '';
  const weaving = (STORY as any).weaves;
  try {
    (STORY as any).weaves = true; STORY.story.weaving = true;
    click({ open: 's-1' });
    await sleep(40);

    // Refused: the row says what the server said, with both ways on, and nothing was written.
    stubRefuse = refusal(); POSTED.length = 0;
    click({ continue: '1' });
    await sleep(120);
    assert.ok(row(), `a refusal draws the row on the composer: ${html('dockCol').slice(0, 200)}`);
    assert.ok(row().includes('4 oldest passages still in view'), 'saying what would drop out');
    assert.match(row(), /data-weaveanyway[^>]*>\s*Write anyway\s*</, 'offering to write anyway');
    assert.match(row(), /data-weaveoff[^>]*>\s*Turn Plans first off for this tale\s*</, 'and to turn weaving off');
    assert.doesNotMatch(row().replace(/<!--[\s\S]*?-->/g, ''), /\b(think|thinking|reasoning|planning)\b/i,
      'in the writer\'s word, weaving');
    assert.ok(!POSTED.some((p: any) => p.url === '/api/accept'), 'and nothing was kept');

    // Write anyway: the same press again, with the override, and the row goes.
    stubRefuse = null; POSTED.length = 0;
    click({ weaveanyway: '1' });
    await sleep(300);
    assert.strictEqual(gens().length, 1, 'write anyway sends one generation');
    assert.strictEqual(gens()[0].body.weaveAnyway, true, 'with the override');
    assert.strictEqual(gens()[0].body.mode, 'continue', 'as the same press');
    assert.ok(!row(), 'and the row is gone');

    // Turn weaving off: the book's switch flips, then the same press writes without the override.
    stubRefuse = refusal(); POSTED.length = 0;
    click({ continue: '1' });
    await sleep(120);
    assert.ok(row(), 'refused again');
    stubRefuse = null; POSTED.length = 0;
    click({ weaveoff: '1' });
    await sleep(300);
    const saved = POSTED.findIndex((p: any) => p.url === '/api/story' && p.body.story?.weaving === false);
    const sent = POSTED.findIndex((p: any) => String(p.url).startsWith('/api/generate'));
    assert.ok(saved >= 0, 'turning weaving off saves the switch');
    assert.ok(sent > saved, 'and then writes');
    assert.ok(!POSTED[sent].body.weaveAnyway, 'normally, with no override');
    assert.ok(!row(), 'and the row is gone');

    // Your own line is written ONCE. In Speaking As it reaches the page before the model is asked,
    // so writing anyway must ask again without putting it on the page a second time.
    pickMode('speak');
    nodes.get('input').value = 'Hold the door.';
    stubRefuse = refusal(); POSTED.length = 0;
    click({ send: '1' });
    await sleep(200);
    assert.ok(row(), 'a speaking line can be refused too');
    stubRefuse = null;
    click({ weaveanyway: '1' });
    await sleep(300);
    assert.strictEqual(POSTED.filter((p: any) => p.url === '/api/write').length, 1, 'your line goes on the page once');
    assert.strictEqual(gens().at(-1)?.body.weaveAnyway, true, 'and the model is asked again, with the override');
    assert.strictEqual(gens().at(-1)?.body.mode, 'speak', 'in the same mode');
    pickMode('continue');

    // A re-roll that is refused re-rolls the same passage when written anyway.
    stubRefuse = refusal(); POSTED.length = 0;
    click({ re: 'p-4' });
    await sleep(200);
    assert.ok(row(), 'a re-roll can be refused');
    stubRefuse = null; POSTED.length = 0;
    click({ weaveanyway: '1' });
    await sleep(300);
    assert.strictEqual(gens()[0]?.body.regenerateOf, 'p-4', 'write anyway re-rolls the same passage');
    assert.strictEqual(gens()[0]?.body.weaveAnyway, true, 'with the override');

    // An overflow cannot be written anyway: the prompt would not fit beside the plan's room.
    stubRefuse = refusal(true);
    click({ continue: '1' });
    await sleep(120);
    assert.ok(row(), 'an overflow is refused on the row');
    assert.doesNotMatch(row(), /data-weaveanyway/, 'with no Write anyway, because it would not fit');
    assert.match(row(), /data-weaveoff/, 'and Turn weaving off still there');
  } finally {
    stubRefuse = null; (STORY as any).weaves = weaving; STORY.story.weaving = false;
    click({ open: 's-1' }); await sleep(40);
  }
}
ok('a weaving refusal is a row on the composer with Write anyway and Turn weaving off, and each sends the press again');

// #58 · A MODEL THAT ALWAYS WEAVES IS REFUSED WITH ANOTHER WAY ON. Turning weaving off cannot change
// what such a model does, so the row never offers it: Write anyway (when the prompt still fits) and
// Use another model for this book, which opens the book's model list in the Storyteller.
{
  const MSG = 'Plans first sets aside 5,000 tokens for Anansi to plan in, and in this tale that would leave '
    + 'out the 4 oldest passages still in view. Use another model for this tale, or write anyway and leave them out.';
  const refusal = (overflows = false) => ({ error: MSG, manifest: MANIFEST.manifest,
    weaveFit: { overflows, alwaysWeaves: true, message: MSG, drops: [{ kind: 'PROSE', id: 'p-1' }] } });
  const row = () => html('dockCol').match(/<div id="weavefit"[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? '';
  const weaving = (STORY as any).weaves;
  try {
    (STORY as any).weaves = true;
    click({ open: 's-1' });
    await sleep(40);

    stubRefuse = refusal(); POSTED.length = 0;
    click({ continue: '1' });
    await sleep(120);
    assert.ok(row(), 'ALWAYS-ROW: a refusal on a model that always weaves draws the row');
    assert.doesNotMatch(row(), /data-weaveoff/, 'ALWAYS-ROW: with no Turn weaving off, which cannot work for it');
    assert.match(row(), /data-weaveanyway[^>]*>\s*Write anyway\s*</, 'ALWAYS-ROW: Write anyway');
    assert.match(row(), /data-weavemodel[^>]*>\s*Use another model for this tale\s*</, 'ALWAYS-ROW: and Use another model for this book');

    // Use another model: the Storyteller opens on the book's model list, nothing is saved or sent.
    stubRefuse = null; POSTED.length = 0;
    click({ weavemodel: '1' });
    await sleep(80);
    assert.match(html('sideBody'), /data-tellerlist="tale" aria-expanded="true"[\s\S]*data-talemodel=/, 'ALWAYS-MODEL: the Storyteller opens on the book\'s model list, open');
    assert.ok(!row(), 'ALWAYS-MODEL: and the row is gone');
    assert.ok(!POSTED.some((p: any) => p.url === '/api/story' || String(p.url).startsWith('/api/generate')),
      'ALWAYS-MODEL: and nothing is saved or written until the writer picks');

    // Write anyway and Use another model are one handler whatever the refusal says, so pressing
    // them is the #56 block's Write anyway and ALWAYS-MODEL above; here only what is drawn differs.
    // An overflow: another model is the only way on.
    stubRefuse = refusal(true);
    click({ continue: '1' });
    await sleep(120);
    assert.ok(row(), 'ALWAYS-OVERFLOW: an overflow is refused on the row');
    assert.doesNotMatch(row(), /data-weaveanyway|data-weaveoff/, 'ALWAYS-OVERFLOW: with neither Write anyway nor Turn weaving off');
    assert.match(row(), /data-weavemodel/, 'ALWAYS-OVERFLOW: only Use another model for this book');
    stubRefuse = null;
  } finally {
    stubRefuse = null; (STORY as any).weaves = weaving;
    click({ panel: '' }); click({ open: 's-1' }); await sleep(40);
  }
}
ok('a refusal on a model that always weaves offers Write anyway and another model, never Turn weaving off');

// #56. THE CONTEXT PANEL SAYS IT BEFORE THE PRESS. Its preview is the weaving assembly, which is what
// Write anyway sends, and it carries the same refusal the press would get — so the panel and the
// press never disagree about whether this passage can be written as things stand.
{
  const MSG = 'Plans first sets aside 5,000 tokens for Anansi to plan in, and in this tale that would leave '
    + 'out the oldest passage still in view. Turn Plans first off for this tale, or write anyway and leave them out.';
  try {
    (MANIFEST as any).weaveFit = { overflows: false, message: MSG, drops: [{ kind: 'PROSE', id: 'p-1' }] };
    click({ open: 's-1' });
    await sleep(40);
    click({ panel: 'context' });
    await sleep(40);
    assert.ok(html('sideBody').includes('the oldest passage still in view'), 'the Context panel carries the refusal');
    delete (MANIFEST as any).weaveFit;
    click({ open: 's-1' });
    await sleep(40);
    if (!html('sideBody').includes('What he will read next time')) click({ panel: 'context' });
    await sleep(40);
    assert.ok(html('sideBody').includes('What he will read next time'), 'precondition: the Context panel is open');
    assert.ok(!html('sideBody').includes('still in view'), 'and says nothing when weaving fits');
  } finally { delete (MANIFEST as any).weaveFit; }
}
ok('the Context panel carries the weaving refusal the press would get, and nothing when it fits');

// #56 with #57. TALK AND INVENT ARE REFUSED THE SAME WAY, and get the same two ways on, drawn where
// the press was made: in the Talk panel above the ask box, and in the tray that wrote the thread.
{
  const MSG = 'Plans first sets aside 5,000 tokens for Anansi to plan in, and in this tale that would leave '
    + 'out the 2 oldest passages still in view. Turn Plans first off for this tale, or write anyway and leave them out.';
  const refusal = { error: MSG, manifest: MANIFEST.manifest,
    weaveFit: { overflows: false, message: MSG, drops: [{ kind: 'PROSE', id: 'p-1' }] } };
  const talks = () => POSTED.filter((p: any) => p.url === '/api/talk');
  const rowIn = (id: string) => html(id).match(/<div id="weavefit"[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? '';
  try {
    click({ open: 's-1' });
    await sleep(40);
    click({ panel: 'anansi' });
    await sleep(30);
    // Talk: refused, then written anyway, and the question is asked once, not twice.
    stubTalk = refusal; POSTED.length = 0;
    (document as any).getElementById('input').value = 'What is this story about?';
    click({ send: '1' });
    await sleep(60);
    assert.ok(rowIn('dockCol').includes('2 oldest passages'), `a refused Talk draws the row in the composer's Talk: ${rowIn('dockCol')}`);
    assert.match(rowIn('dockCol'), /data-weaveanyway/, 'with Write anyway');
    assert.match(rowIn('dockCol'), /data-weaveoff/, 'and Turn weaving off');
    assert.ok(!rowIn('sideBody'), 'and not in a drawer: Talk has none in a tale (2026-10-29)');
    stubTalk = null;
    click({ weaveanyway: '1' });
    await sleep(80);
    assert.strictEqual(talks().length, 2, 'write anyway asks again');
    assert.strictEqual(talks()[1].body.weaveAnyway, true, 'with the override');
    assert.strictEqual(talks()[1].body.said, 'What is this story about?', 'the same question');
    assert.deepStrictEqual(talks()[1].body.turns, talks()[0].body.turns, 'with the conversation as it was, the question not repeated');
    assert.ok(!rowIn('dockCol'), 'and the row is gone');
    assert.ok(html('dockCol').includes('It is about a debt.'), 'and the answer arrives');

    // Turn weaving off from a refused Talk: saved, then asked again without the override.
    stubTalk = refusal; POSTED.length = 0;
    (document as any).getElementById('input').value = 'Who is Marek?';
    click({ send: '1' });
    await sleep(60);
    stubTalk = null;
    click({ weaveoff: '1' });
    await sleep(100);
    const off = POSTED.findIndex((p: any) => p.url === '/api/story' && p.body.story?.weaving === false);
    const again = POSTED.findLastIndex((p: any) => p.url === '/api/talk');
    assert.ok(off >= 0 && again > off, 'turn weaving off saves the switch, then asks again');
    assert.ok(!POSTED[again].body.weaveAnyway, 'without the override');

    // Invent: the tray in the new-thread form.
    click({ panel: 'threads' }); click({ newlore: '1' }); click({ lorekind: 'lore' });
    await sleep(30);
    stubInvent = refusal; POSTED.length = 0;
    const press = (dataset: any) => (listeners.click ?? []).forEach((f: Function) => f({ target: { closest: () => ({
      dataset, querySelector: () => null, disabled: false, textContent: '', style: {}, closest: () => null }) } }));
    press({ invent: 'lore' });
    await sleep(60);
    assert.ok(rowIn('sideBody').includes('2 oldest passages'), 'a refused invention draws the row in its tray');
    stubInvent = null;
    click({ weaveanyway: '1' });
    await sleep(80);
    const inv = POSTED.filter((p: any) => p.url === '/api/invent');
    assert.strictEqual(inv.length, 2, 'write anyway invents again');
    assert.strictEqual(inv[1].body.weaveAnyway, true, 'with the override');
    assert.strictEqual(inv[1].body.kind, 'lore', 'the same kind');
    assert.ok(!rowIn('sideBody'), 'and the row is gone');
  } finally {
    stubTalk = null; stubInvent = null;
    click({ newlore: '1' }); click({ open: 's-1' }); await sleep(40);
  }
}
ok('a refused Talk or invention gets the same row where it was asked, and each button asks again');

// TALK LIVES IN THE COMPOSER (Seth, 2026-10-29: "drop the Talk drawer"). Every door to the drawer in a
// tale turns the composer to Talk; the conversation sits above the box, small or full screen, and a
// question asked there stays there.
{
  const talks = () => POSTED.filter((p: any) => p.url === '/api/talk');
  click({ open: 's-1' }); await sleep(40);
  click({ panel: 'anansi' }); await sleep(30);
  assert.ok((document as any).getElementById('side').hidden, 'TALK-NO-DRAWER: the Talk drawer does not open in a tale');
  assert.match(html('dockCol'), /id="talkthread"/, '  the composer turns to Talk instead, with the conversation above the box');
  // ALWAYS FULL SCREEN (Seth, 2026-10-30: "Anansi chat should always open full screen").
  assert.match(html('dockCol'), /data-bigin="1" aria-pressed="true"/, 'TALK-OPENS-FULL: Talk opens full screen');
  POSTED.length = 0;
  (document as any).getElementById('input').value = 'Who is Marek?';
  click({ send: '1' }); await sleep(80);
  assert.strictEqual(talks().length, 1, 'TALK-DOCK-SEND: Send asks Anansi');
  const dock = html('dockCol');
  assert.ok(dock.includes('Who is Marek?') && dock.includes('It is about a debt.'), 'TALK-DOCK-TURNS: both sides of the conversation, in the composer');
  assert.ok(dock.indexOf('id="talkthread"') < dock.indexOf('id="input"'), '  above the box');
  assert.ok((document as any).getElementById('side').hidden, '  and no drawer opened for the answer');
  click({ bigin: '1' }); await sleep(20);
  assert.ok(html('dockCol').includes('Who is Marek?'), 'TALK-SMALL: made small, it keeps the same conversation');
  click({ bigin: '1' }); await sleep(20);
  click({ dockwrite: '1' }); await sleep(30);
  assert.doesNotMatch(html('dockCol'), /id="talkthread"/, '  Back to writing puts the conversation away');
  assert.match(html('dockCol'), /data-bigin="1" aria-pressed="false"/, 'TALK-LEAVES-FULL: and the box it leaves is the small one');
}
ok('Talk lives in the composer, small or full screen, with the conversation above the box and no drawer');

// #97 · WHAT TALK CHANGED, IN THE CONVERSATION, WITH UNDO. Each change the server made comes back as a
// line in the writer's words; Undo sends that change's own `undo` back, untouched, and the line then
// says it was undone. A failed Undo says why and leaves the line as it was.
{
  const UNDO = { op: 'thread.set', thread: 'e-1', room: 'facts', addon: 'a-1', text: 'Marek is twenty.' };
  try {
    click({ open: 's-1' });
    await sleep(40);
    click({ panel: 'anansi' });
    await sleep(30);
    stubTalk = { reply: 'Done: he is thirty now.', seconds: 1, tokens: 10,
      changes: [{ words: "Changed Marek's Always true: “Marek is thirty.”", undo: UNDO,
        diff: { before: 'Marek is twenty.', after: 'Marek is thirty.' } }] };
    POSTED.length = 0;
    (document as any).getElementById('input').value = 'Make Marek thirty';
    click({ send: '1' });
    await sleep(80);
    const side = html('dockCol');
    assert.ok(side.includes('Changed Marek&#39;s Always true') || side.includes("Changed Marek's Always true"),
      `TALK-CHANGE-LINE: the change shows in the conversation, in the writer's words:\n${side.slice(0, 600)}`);
    const btn = side.match(/<button[^>]*data-talkundo="([^"]+)"[^>]*>([^<]*)</);
    assert.ok(btn, 'TALK-CHANGE-UNDO: with an Undo beside it');
    assert.match(btn![2], /Undo/, 'TALK-CHANGE-UNDO: labelled Undo');
    // #122 · UNDER THE LINE AND ITS UNDO, what changed, word by word, drawn by the one renderer.
    const { diffHTML: talkDiff } = await import('../web/model.js');
    const drawn = talkDiff('Marek is twenty.', 'Marek is thirty.');
    assert.ok(side.includes(drawn) && side.indexOf(drawn) > side.indexOf('data-talkundo='),
      'TALK-CHANGE-DIFF: the line shows the old text against the new under its Undo');

    // A refused Undo says why, and the line keeps its Undo.
    stubUndo = { error: 'Not undone: Marek has changed since Talk made it.' };
    POSTED.length = 0;
    click({ talkundo: btn![1] });
    await sleep(60);
    const sent = POSTED.filter((p: any) => p.url === '/api/talk/undo');
    assert.strictEqual(sent.length, 1, 'TALK-UNDO-SENDS: one press, one Undo');
    assert.deepStrictEqual(sent[0].body.undo, UNDO, 'TALK-UNDO-SENDS: the change\'s own undo, as the server gave it');
    assert.strictEqual(sent[0].body.storyId, 's-1', 'TALK-UNDO-SENDS: on this tale');
    assert.match(html('dockCol'), /data-talkundo=/, 'TALK-UNDO-REFUSED: a refused Undo leaves the line undoable');

    stubUndo = null;
    click({ talkundo: btn![1] });
    await sleep(60);
    assert.strictEqual(POSTED.filter((p: any) => p.url === '/api/talk/undo').length, 2,
      'TALK-UNDO-REFUSED: and a second press tries again');
    const after = html('dockCol');
    assert.doesNotMatch(after, /data-talkundo=/, 'TALK-UNDO-DONE: once undone, the Undo is gone');
    assert.match(after, /Undone/, `TALK-UNDO-DONE: and the line says it was undone:\n${after.slice(0, 600)}`);
  } finally { stubTalk = null; stubUndo = null; }
}
ok('a change Talk made shows in the conversation with Undo, and Undo sends that change back');

// #99 · ANANSI MAY SEARCH. The switch is permission, so the ask sends `search: true` and never the
// writer's words as a query; the switch reads "Anansi may search"; and every page he read is listed
// under his answer with its link.
{
  const changeIn = (target: any) => (listeners.change ?? []).forEach((f: Function) => f({ target }));
  try {
    click({ open: 's-1' });
    await sleep(40);
    click({ panel: 'anansi' });
    await sleep(30);
    assert.match(html('dockCol'), /data-websearch="1"[^>]*>\s*Anansi may search/, 'SEARCH-LABEL: the switch reads "Anansi may search"');
    changeIn({ dataset: { websearch: '1' }, checked: true });
    stubTalk = { reply: 'Charon rows the dead.', seconds: 1, tokens: 10,
      sources: [{ title: 'Charon - Wikipedia', url: 'https://en.wikipedia.org/wiki/Charon' },
                { title: 'Charon | Mythopedia', url: 'https://mythopedia.com/charon' }] };
    POSTED.length = 0;
    (document as any).getElementById('input').value = 'Who is the ferryman?';
    click({ send: '1' });
    await sleep(80);
    const sent = POSTED.find((p: any) => p.url === '/api/talk');
    assert.strictEqual(sent?.body.search, true, `SEARCH-PERMISSION: the ask sends permission, not the words (${sent?.body.search})`);
    const side = html('dockCol');
    assert.match(side, /<a [^>]*href="https:\/\/en\.wikipedia\.org\/wiki\/Charon"[^>]*>Charon - Wikipedia<\/a>/,
      `SEARCH-PAGES: each page read is listed with its link:\n${side.slice(0, 900)}`);
    assert.match(side, /href="https:\/\/mythopedia\.com\/charon"/, 'SEARCH-PAGES: all of them');
  } finally { stubTalk = null; changeIn({ dataset: { websearch: '1' }, checked: false }); }
}
ok('the switch reads Anansi may search, sends permission, and every page he read is listed with its link');

// #58 · WHAT THE TALK PANEL SAYS WHILE IT WAITS. Weaving when the book weaves (the server's
// `weaves`, which a model that always weaves sets too), and Asking otherwise. Never Thinking: the
// glossary keeps that word off the page.
{
  const weaving = (STORY as any).weaves;
  const said = async (weaves: boolean) => {
    (STORY as any).weaves = weaves;
    click({ open: 's-1' });
    await sleep(40);
    click({ panel: 'anansi' });
    await sleep(30);
    let open!: (v: any) => void;
    stubTalk = new Promise((r) => { open = r; });
    (document as any).getElementById('input').value = 'What is this story about?';
    click({ send: '1' });
    await sleep(30);
    const busy = html('dockCol');
    open({ reply: 'It is about a debt.', seconds: 1, tokens: 10 });
    await sleep(60);
    return busy;
  };
  try {
    const plain = await said(false);
    assert.match(plain, /Asking&hellip;/, 'TALK-BUSY: a Talk call that does not weave says Asking while it waits');
    assert.doesNotMatch(plain, /Thinking|Weaving/, 'TALK-BUSY: and never Thinking or Weaving');
    assert.doesNotMatch(html('dockCol'), /id="weaving"/, 'and the composer shows no count');
    // A weaving Talk call gets the composer's count, and the composer does not: it made no press.
    (STORY as any).weaves = true;
    click({ open: 's-1' });
    await sleep(40);
    click({ panel: 'anansi' });
    await sleep(30);
    let open!: (v: any) => void;
    stubTalk = new Promise((r) => { open = r; });
    (document as any).getElementById('input').value = 'What is this story about?';
    click({ send: '1' });
    await sleep(30);
    assert.match(html('dockCol'), /id="talkweaving"[^>]*>Planning… 0s</, 'TALK-COUNT: a weaving Talk call says Weaving with the seconds');
    assert.doesNotMatch(html('dockCol'), /id="weaving"/, 'TALK-COUNT: and the composer, which made no press, shows no count');
    await sleep(1100);
    assert.strictEqual(String(nodes.get('talkweaving')?.textContent), 'Planning… 1s', 'TALK-COUNT: and the count runs');
    open({ reply: 'It is about a debt.', seconds: 1, tokens: 10 });
    await sleep(60);
    assert.doesNotMatch(html('dockCol'), /Planning…/, 'TALK-COUNT: the answer ends it');
    assert.doesNotMatch(html('dockCol'), /Thinking/, 'and never Thinking');
  } finally { stubTalk = null; (STORY as any).weaves = weaving; }
}
ok('the Talk panel counts the seconds while a weaving call waits, and says Asking in any other');

// #58 · AN INVENTION THAT WEAVES COUNTS ON ITS TRAY'S BUTTON, as the composer does; one that does not
// keeps saying Writing.
{
  const weaving = (STORY as any).weaves;
  const pressed = async (weaves: boolean) => {
    (STORY as any).weaves = weaves;
    click({ open: 's-1' });
    await sleep(40);
    let open!: (v: any) => void;
    stubInvent = new Promise((r) => { open = r; });
    const t: any = { dataset: { invent: 'lore' }, querySelector: () => null, disabled: false, textContent: 'Invent',
      style: {}, closest: () => null };
    (listeners.click ?? []).forEach((f: Function) => f({ target: { closest: () => t } }));
    await sleep(30);
    const busy = String(t.textContent);
    await sleep(1100);
    const later = String(t.textContent);
    open({ title: 'The Rust Choir', duplicate: false });
    await sleep(60);
    return { busy, later, after: String(t.textContent) };
  };
  try {
    const woven = await pressed(true);
    assert.strictEqual(woven.busy, 'Planning… 0s', 'INVENT-COUNT: a weaving invention says Weaving with the seconds');
    assert.strictEqual(woven.later, 'Planning… 1s', 'INVENT-COUNT: and the count runs');
    assert.strictEqual(woven.after, 'Invent', 'INVENT-COUNT: and the button comes back when it answers');
    const plain = await pressed(false);
    assert.strictEqual(plain.busy, 'Writing…', 'the control: an invention that does not weave says Writing');
  } finally { stubInvent = null; (STORY as any).weaves = weaving; }
}
ok('an invention that weaves counts the seconds on its button, and one that does not says Writing');

// #58 · EACH CALL HAS ITS OWN COUNT. Talk can be asked while a passage weaves (its press checks only
// that Talk is free), so the two counts run side by side: starting one does not empty the other, and
// the passage's first word ends the passage's count, never Talk's.
{
  const weaving = (STORY as any).weaves;
  let open!: () => void, answer!: (v: any) => void;
  try {
    (STORY as any).weaves = true;
    click({ open: 's-1' });
    await sleep(40);
    streamGate = new Promise<void>((r) => { open = r; });
    let end!: () => void;
    endGate = new Promise<void>((r) => { end = r; });
    void click({ continue: '1' });
    await sleep(30);
    click({ panel: 'anansi' });
    await sleep(30);
    stubTalk = new Promise((r) => { answer = r; });
    (document as any).getElementById('input').value = 'What is this story about?';
    click({ send: '1' });
    // Seconds as numbers, and rising rather than exact: Talk's count starts a turn after its press,
    // so an exact second is a race with this suite's own load.
    const secs = (id: string) => Number(/^Planning… (\d+)s$/.exec(String(nodes.get(id)?.textContent))?.[1] ?? NaN);
    await sleep(1100);
    assert.ok(secs('weaving') >= 1, `TWO-COUNTS: a Talk press leaves the weaving passage's count running (${nodes.get('weaving')?.textContent})`);
    const talkAt = secs('talkweaving');
    assert.ok(talkAt >= 0, `TWO-COUNTS: and Talk counts its own (${nodes.get('talkweaving')?.textContent})`);
    open(); await sleep(60);
    assert.strictEqual(String(nodes.get('weaving')?.textContent ?? ''), '', 'TWO-COUNTS: the passage\'s first word ends the passage\'s count');
    // POLLED, NOT ONE FIXED WAIT. A single 1.1 s sleep raced the next one-second tick, and under
    // test/all.ts's parallel load the tick landed late and this read the same second twice (flaked
    // 2026-10-26 and 2026-10-27). Up to 3 s for the count to rise; a stopped count still fails.
    for (let i = 0; i < 30 && !(secs('talkweaving') > talkAt); i++) await sleep(100);
    assert.ok(secs('talkweaving') > talkAt,
      `TWO-COUNTS: and Talk, still weaving, keeps counting (${talkAt} then ${nodes.get('talkweaving')?.textContent})`);
    answer({ reply: 'It is about a debt.', seconds: 1, tokens: 10 });
    end(); await sleep(60);
  } finally { streamGate = null; endGate = null; stubTalk = null; (STORY as any).weaves = weaving; }
}
ok('a passage and a Talk call that weave at once each keep their own count');

// #58 · A SECOND PRESS ON A BUSY INVENTION IS NOT A NEW CALL, so it does not touch the first's count.
{
  const weaving = (STORY as any).weaves;
  let answer!: (v: any) => void;
  try {
    (STORY as any).weaves = true;
    click({ open: 's-1' });
    await sleep(40);
    stubInvent = new Promise((r) => { answer = r; });
    const t: any = { dataset: { invent: 'lore' }, querySelector: () => null, disabled: false, textContent: 'Invent',
      style: {}, closest: () => null };
    const press = () => (listeners.click ?? []).forEach((f: Function) => f({ target: { closest: () => t } }));
    const secs = () => Number(/^Planning… (\d+)s$/.exec(String(t.textContent))?.[1] ?? NaN);
    press();
    await sleep(1050);
    const first = secs();
    press();
    await sleep(1100);
    assert.ok(secs() > first, `BUSY-INVENT: the second press leaves the first call's count running (${first} then ${t.textContent})`);
    assert.ok((globalThis as any).document.documentElement.dataset.work,
      'BUSY-INVENT: and the working ring stays up while the first call runs');
    answer({ title: 'The Rust Choir', duplicate: false });
    await sleep(60);
    assert.strictEqual(String(t.textContent), 'Invent', 'BUSY-INVENT: and the button comes back when it answers');
  } finally { stubInvent = null; (STORY as any).weaves = weaving; }
}
ok('a second press on a weaving invention does not reset the first press\'s count');

// #53 · WHERE A MODEL RUNS, on every surface that names one: a circle in the local or the remote
// colour, filled when a local model is awake and hollow when it is asleep (a remote one is always
// filled), and beside it a spider for local or a feather for remote, so colour is never the only
// cue. Read off the rendered rows, one model at a time, so a row cannot borrow another row's mark.
{
  const { MARK } = await import('../web/model.js');
  const visible = (h: string) => h.replace(/<!--[\s\S]*?-->/g, '');
  const first = (name: string) => `d="M${MARK[name].split('M').filter(Boolean)[0]}"`;
  // The one mark inside a stretch of HTML: which source, whether awake, how the circle is painted,
  // and which glyph rides beside it.
  const runs = (h: string) => {
    const all = [...h.matchAll(/<span data-runs="(local|remote)" data-awake="([01])"([\s\S]*?)<\/svg><\/span>/g)];
    assert.strictEqual(all.length, 1, `expected exactly one where-it-runs mark, found ${all.length}`);
    const [, where, awake, body] = all[0];
    const ring = /border-radius:50%[^"]*border:1\.5px solid var\(--src-(local|remote)\)[^"]*background:([^;"]+)/.exec(body);
    assert.ok(ring, 'the mark carries a circle drawn in a source token');
    return { where, awake: awake === '1', ring: ring![1], fill: ring![2].trim(),
      spider: body.includes(first('spider')), feather: body.includes(first('feather')) };
  };

  // #131. The list is on Storyteller's Model tab, under Your model, open on a press (2026-11-03).
  click({ modelmenu: '1' });
  for (let i = 0; i < 20 && !/data-tellerlist="usual"/.test(html('sideBody')); i++) await sleep(25);
  click({ tellerlist: 'usual' });
  const tab = visible(html('sideBody'));
  click({ tellerlist: 'usual' });
  const rail = tab.slice(tab.indexOf('>Your model<'));
  const row = (id: string) => {
    const at = rail.indexOf(`<button data-pickmodel="${id}"`);
    assert.ok(at > 0, `the list lists ${id}`);
    return rail.slice(at, rail.indexOf('</button>', at));
  };

  const awake = runs(row('Qwen3.6-WNTH-35B-A3B-NN'));
  assert.deepStrictEqual([awake.where, awake.awake, awake.ring, awake.fill, awake.spider, awake.feather],
    ['local', true, 'local', 'var(--src-local)', true, false],
    'a loaded local model: a filled circle in the local colour, and the spider');
  const asleep = runs(row('Wayfarer-2-RPNT-12B'));
  assert.deepStrictEqual([asleep.where, asleep.awake, asleep.ring, asleep.fill, asleep.spider],
    ['local', false, 'local', 'transparent', true],
    'an unloaded local model: the same colour, hollow, and still the spider');
  const remote = runs(row('featherless:Grey/Kestrel-Heretic-24B'));
  assert.deepStrictEqual([remote.where, remote.awake, remote.ring, remote.fill, remote.spider, remote.feather],
    ['remote', true, 'remote', 'var(--src-remote)', false, true],
    'a remote model: always filled, in the remote colour, with the feather');
  assert.match(row('featherless:Grey/Kestrel-Heretic-24B'), /Kestrel Heretic 24B/,
    'and the row still names it by its decoded name');

  // THE STRIP at the top of the menu. The rail's button is the strip's own (#131: nothing drops
  // open under it any more).
  const strip = visible(html('rail'));
  const at = strip.indexOf('<button data-modelmenu=');
  const mine = runs(strip.slice(at, strip.indexOf('</button>', at)));
  assert.strictEqual(mine.where, 'local', 'the strip marks the model writing now as local');
  assert.ok(mine.spider, 'with the spider');

  // THE STORYTELLER'S LIST for this tale: each row says where its model runs in words, and the
  // drawn mark sits on the row for the model this book is written by.
  const wasModel = STORY.model;
  STORY.model = 'featherless:Grey/Kestrel-Heretic-24B';
  click({ open: 's-1' });
  await sleep(40);
  // The list read again, so the writer's usual model is the default and not this tale's model,
  // and the tale's list (which leaves the usual model out) holds the remote one.
  click({ dropshort: 'featherless:Other/Unused-12B' });
  await sleep(40);
  click({ panel: 'teller' });
  await sleep(30);
  const teller = visible(html('sideBody'));
  click({ tellerlist: 'tale' });
  const list = visible(html('sideBody'));
  const option = (id: string) => list.match(new RegExp(`data-talemodel="${id}"[^>]*><span[^>]*>([^<]*)</span>`))?.[1] ?? '';
  assert.match(option('Qwen3\\.6-WNTH-35B-A3B-NN'), / · local, awake$/, 'a loaded local option says so');
  assert.match(option('Wayfarer-2-RPNT-12B'), / · local, asleep$/, 'an unloaded one says so');
  assert.match(option('featherless:Grey/Kestrel-Heretic-24B'), / · remote, on Featherless$/,
    'and a remote option says where it runs');
  const beside = teller.slice(teller.indexOf('data-tellerlist="tale"'));
  const using = runs(beside.slice(0, beside.indexOf('What it is')));
  assert.deepStrictEqual([using.where, using.awake, using.feather], ['remote', true, true],
    'beside the select, the mark for the model this book is written by');
  // THE STRIP NAMES WHAT WRITES THE OPEN BOOK. The writer default here is local; this book's
  // resolved model is remote, so a strip that read only the default would show the spider. The
  // model list is read again first (taking another model off the shortlist does that), because a
  // fresh list is what put the writer default back on the strip while the book wrote remotely.
  click({ dropshort: 'featherless:Other/Unused-12B' });
  await sleep(40);
  const bookStrip = visible(html('rail'));
  const sAt = bookStrip.indexOf('<button data-modelmenu=');
  const stripBtn = bookStrip.slice(sAt, bookStrip.indexOf('</button>', sAt));
  const writing = runs(stripBtn);
  assert.deepStrictEqual([writing.where, writing.feather], ['remote', true],
    'BOOK-STRIP: in a book pinned to a remote model, the strip marks it remote, with the feather');
  assert.match(stripBtn, /Kestrel Heretic 24B/, 'BOOK-STRIP: and names the model that writes the book');
  STORY.model = wasModel;
  click({ open: 's-1' });
  await sleep(40);
  ok('menu rows, the strip and the book\'s picker carry the circle and the spider or the feather');
}

// THE MODEL PANEL IN A BOOK reads what writes that book. "Writing now" is the book's model, not the
// writer default; a guest opening the owner's remote pin is told its limit and its cost from the
// pin row the book carries, not "Featherless did not say", which was false; and a remote model not
// on this writer's own shortlist offers no switch, because the server refuses it as a default.
{
  const strip = (h: string) => h.replace(/<!--[\s\S]*?-->/g, '');
  const LENT = 'featherless:owner/Lent-Remote-24B';
  const lentRow = { id: LENT, status: 'remote', source: 'remote', ready: true, ctxSize: 32768, perSlot: 32768, cost: 2 };
  const was = { model: STORY.model, pin: (STORY as any).pin, story: (STORY.story as any).model };
  const panelFor = async (id: string) => {
    click({ modelinfo: id });
    await sleep(30);
    return strip(html('sideBody'));
  };
  modelsRemote = true;
  click({ dropshort: 'featherless:Other/Unused-12B' });
  await sleep(40);

  // A guest in a book the owner pinned to a remote model on the OWNER's shortlist.
  STORY.model = LENT; (STORY as any).pin = lentRow; (STORY.story as any).model = LENT;
  click({ open: 's-1' });
  await sleep(40);
  // The list read again, which puts the writer default back in SRV.model: opening a book had set it
  // to the book's model, so a panel comparing with SRV.model passed right after opening.
  click({ dropshort: 'featherless:Other/Unused-12B' });
  await sleep(40);
  const lent = await panelFor(LENT);
  // In words for a writer since 2026-10-25 (32,768 tokens); the admin sees "Featherless holds".
  assert.match(lent, /about 25,000 words/, 'LENT-PANEL: the limit, from the pin row the book carries');
  assert.match(lent, /2 units of your Featherless plan/, 'LENT-PANEL: and the cost the owner\'s shortlist holds');
  assert.doesNotMatch(lent, /did not say/, 'LENT-PANEL: never "Featherless did not say", which is false');
  assert.match(lent, /writing now/, 'WRITING-NOW: the model that writes the open book is the one writing');
  assert.doesNotMatch(lent, /data-pickmodel=/, 'LENT-PANEL: and no switch to a model off this writer\'s list');
  const dflt = await panelFor('write-nt-qwen36-h');
  assert.doesNotMatch(dflt, /writing now/, 'WRITING-NOW: the writer default does not write this book');

  // The same pin when it is not what writes the book (the book falls back to a local model): the
  // panel still offers no switch, because the guest's own shortlist does not hold it.
  STORY.model = 'Qwen3.6-WNTH-35B-A3B-NN';
  click({ open: 's-1' });
  await sleep(40);
  const idle = await panelFor(LENT);
  assert.doesNotMatch(idle, /writing now/, 'the detector: here the pin is not writing');
  assert.doesNotMatch(idle, /data-pickmodel=/,
    'LENT-PANEL: a remote model off this writer\'s own shortlist offers no Write with this one');
  assert.match(idle, /not on your shortlist/, 'LENT-PANEL: and says why');
  const own = await panelFor('featherless:Grey/Kestrel-Heretic-24B');
  assert.match(own, /data-pickmodel="featherless:Grey\/Kestrel-Heretic-24B"/,
    'while a remote model on the writer\'s own shortlist still offers the switch');

  STORY.model = was.model; (STORY as any).pin = was.pin; (STORY.story as any).model = was.story;
  modelsRemote = false;
  click({ dropshort: 'featherless:Other/Unused-12B' });
  await sleep(40);
  click({ open: 's-1' });
  await sleep(40);
}
ok('the model panel in a book names what writes it, reads a lent pin\'s limit and cost, and offers no switch it cannot make');

// ONE PREFIX. Whether a model is remote is decided from its id's prefix, on the server by
// `REMOTE_PREFIX` and in the browser by `whereRuns`. Two spellings of it drift apart silently, so
// the browser's constant is held equal to the server's, and the browser spells it in one place.
{
  const { REMOTE_PREFIX: browser, whereRuns } = await import('../web/model.js');
  const { REMOTE_PREFIX: server } = await import('../src/llama.ts');
  assert.strictEqual(browser, server, "PREFIX: the browser's remote prefix is the server's");
  assert.strictEqual(whereRuns(`${server}Grey/Kestrel-Heretic-24B`).remote, true,
    'PREFIX: and an id with the server prefix reads as remote in the browser');
  assert.strictEqual(whereRuns('Qwen3.6-WNTH-35B-A3B-NN').remote, false, 'and one without it as local');
  const { readFileSync } = await import('node:fs');
  // Code only: a line comment may name the prefix, and saying it is not deciding with it.
  const code = ['model.js', 'app.js', 'api.js'].map((f) => readFileSync(new URL(`../web/${f}`, import.meta.url), 'utf8')
    .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')).join('\n');
  assert.strictEqual((code.match(/featherless:/g) ?? []).length, 1,
    'PREFIX: the browser writes the prefix once, in the constant, and decides remote-ness from it');
  ok("the browser's remote prefix is the server's, and is written once");
}

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
  await sleep(40);
  click({ panel: 'story' });
  await sleep(30);
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
      for (let i = 0; i < 80 && settled() < n; i++) await sleep(15);
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
    await sleep(40);
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
    assert.match(mixed, /did not arrive &mdash; the line was busy/, 'a 429 says so in its own square');
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
  await sleep(40);
  click({ nav: 'create' });
  await sleep(30);

  const before = html('page');
  assert.match(before, /id="idea"/, 'before it sparks, the idea box is the screen');
  assert.match(before, /data-spark="1"/, 'with the button that sends it');

  // The handler reads the box out of the DOM, so the stub has to answer for it.
  doc.getElementById = (id: string) =>
    id === 'idea' ? { value: 'Six houses, one winter.' } : (nodes.get(id) ?? el(id));
  try {
    click({ spark: '1' });
    for (let i = 0; i < 40 && !/data-sp=/.test(html('page')); i++) await sleep(25);
  } finally { doc.getElementById = (id: string) => nodes.get(id) ?? el(id); }

  const after = html('page');
  // #21 §3. STEP ONE IS THE IDEA NOW, which is the sentence everything came from — it used to live
  // on a screen that was gone the moment you sparked, so it could not be read, corrected, or asked
  // again from. The title is step two.
  assert.match(after, /data-sp="idea"/, 'the wizard is on screen, holding the idea');
  assert.match(after, /Six houses, one winter\./, 'which is what was typed');
  assert.match(after, /data-sparkstep="2"/, 'and the book is the step after it');
  // THE POINT OF THE CHANGE. Not /idea/ — the word appears in the prose of the page either way;
  // the ELEMENT is what must be gone, and it is the element that came back empty every repaint.
  assert.doesNotMatch(after, /id="idea"/, 'and the idea box is gone, not merely beside it');
  assert.doesNotMatch(after, /data-spark="1"/, 'along with the button that has nothing left to send');
  assert.doesNotMatch(after, /class="split(?: [^"]*)?"/,
    'and the two-column layout with it — on a phone that stacks, which put the dead box on top');
  // (A "rendered exactly once" assertion stood here and was DELETED. Falsifying it — putting
  // `S.spark ? sparkReview() : ''` back into the aside — left the suite green, because the early
  // return means the aside is never reached while S.spark is set. It could not fail while the
  // check above it passes, which is what a redundant guard looks like.)
}
ok('sparking replaces the screen with the wizard rather than sitting it beside an empty box');

// #123 · THE TALE STARTS WITH THE WRITER'S OWN VOICE, and the one the spark wrote is offered beside
// it as a diff with Use this. It is the tale's only when chosen, and taking it is undone like the rest.
{
  const voiceBox = (h: string) => h.slice(h.indexOf('data-sp="writingStyle"'), h.indexOf('</textarea>', h.indexOf('data-sp="writingStyle"')));
  let pv = html('page');
  assert.match(voiceBox(pv), />Cold, spare\.$/, 'VOICE-START: the Voice box holds the Voice the tale started with');
  assert.doesNotMatch(voiceBox(pv), /frost/, '  and not the one the spark wrote');
  assert.match(pv, /data-spvoiceoffer="1"/, 'VOICE-OFFER: the spark\'s Voice is offered with Use this');
  assert.match(pv, /<div class="diff" data-view="now">[\s\S]*<ins>[^<]*Long sentences/, '  as a diff against the writer\'s own');
  click({ spvoiceoffer: '1' });
  pv = html('page');
  assert.match(voiceBox(pv), /frost in every one\.$/, 'VOICE-USE: Use this puts the offered Voice in the box');
  assert.doesNotMatch(pv, /data-spvoiceoffer="1"/, '  and the offer, now taken, is gone');
  assert.match(pv, /data-spundo="1">Undo the offered Voice/, '  and an undo is right there');
  click({ spundo: '1' });
  pv = html('page');
  assert.match(voiceBox(pv), />Cold, spare\.$/, 'VOICE-USE: and it is undone like the rest');
  assert.match(pv, /data-spvoiceoffer="1"/, '  with the offer back');
}
ok('VOICE-OFFER: the tale starts with the writer\'s Voice and offers the spark\'s as a diff with Use this');

// #88 · THE WIZARD ASKS WHO YOU PLAY FIRST AND ENDS IN A PREVIEW. Driven from the wizard the block
// above left on screen. Nothing may post but the spark calls until Start writing, and Start writing
// must carry the draft as the threads step and Begin left it. Seth, 2026-10-30: four steps, the
// tale's rarer boxes in folds, the threads as a tale's threads look, and Begin reading it back.
{
  const doc = (globalThis as any).document;
  const wasQSA = doc.querySelectorAll, wasQS = doc.querySelector;
  const settle = async (re: RegExp) => { for (let i = 0; i < 40 && !re.test(html('page')); i++) await sleep(25); };
  // What the wizard reads off the screen when it harvests: a list per selector, nothing by default.
  let onScreen: Record<string, any[]> = {};
  doc.querySelectorAll = (sel: string) => onScreen[sel] ?? [];
  // A <details> fold's markup, found by its summary's words; and the markup with every fold cut out,
  // which is what is on screen before anything is unfolded.
  const foldOf = (h: string, label: string) => {
    const at = h.indexOf(label), start = h.lastIndexOf('<details', at);
    return at < 0 || start < 0 ? '' : h.slice(start, h.indexOf('</details>', at));
  };
  const bare = (h: string) => h.replace(/<details[\s\S]*?<\/details>/g, '');
  // The step's own controls: the step dots, Talk, Next, Back, Skip and Discard are on every step.
  const CHROME = /data-(?:sparkstep|panel|accept-spark|drop-spark)=/;
  const controls = (h: string) => [...h.matchAll(/<(?:button|input|textarea|select)\b[^>]*>/g)]
    .map((m) => m[0]).filter((t) => !CHROME.test(t));
  // An input event from a box of the pocket panel, which keeps what is typed in S.pocket.
  const typeIn = (id: string, value: string) =>
    (listeners.input ?? []).forEach((f: Function) => f({ target: { id, value, dataset: {} } }));
  try {
    const steps = [...html('page').matchAll(/data-sparkstep="\d+"[^>]*?aria-label="([^"]+)"/g)].map((m) => m[1]);
    assert.deepStrictEqual(steps, ['The tale', 'You', 'The threads', 'Begin'],
      'WIZ-ORDER: four steps, You before the threads, and Begin last (Seth, 2026-10-30)');

    // THE TALE: about eleven controls on screen, and the rest in two folds.
    let tale = html('page');
    const more = foldOf(tale, 'More about the tale');
    assert.match(more, /data-sp="world"/, 'WIZ-MORE: the Set in box is in the More about the tale fold');
    assert.match(more, /data-spfollow="1"/, 'WIZ-WORLD-HOME: and the follow picker beside it, its one home');
    assert.match(more, /data-sp="styleNote"[\s\S]*data-spstyle="1"/, '  and the genre flavour with its Reweave');
    const vo = foldOf(tale, 'Voice options');
    assert.match(vo, /data-spvoice="mine"[\s\S]*data-spvoice="shipped"/, 'WIZ-VOICE-FOLD: your voice and Anansi\'s voice are in Voice options');
    assert.match(vo, /data-spvoiceoffer="1"/, '  with the Voice he offered');
    const onTale = controls(bare(tale));
    assert.ok(onTale.length <= 11, `WIZ-TALE-COUNT: about eleven controls on The tale, not nineteen (${onTale.length})`);
    for (const k of ['idea', 'title', 'genre', 'premise', 'writingStyle'])
      assert.ok(onTale.some((t) => t.includes(`data-sp="${k}"`)), `  ${k} is on screen`);
    // The step's own hints, from its dots down: the page heading above them says nothing is written yet.
    const hints = (bare(tale.slice(tale.indexOf('data-sparkstep'))).match(/class="hint\b/g) ?? []).length;
    assert.ok(hints <= 3, `WIZ-TALE-HINTS: about three hints on The tale, not eight (${hints})`);
    // ONE WORD: every re-roll press says Reweave.
    const fieldPresses = [...tale.matchAll(/data-spfield="(\w+)"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2].trim()]);
    assert.deepStrictEqual(fieldPresses, [['title', 'Reweave'], ['genre', 'Reweave'], ['premise', 'Reweave']],
      'WIZ-REWEAVE-WORD: title, genre and premise each have a press that says Reweave');
    assert.match(tale, /data-spreroll="1"[^>]*>\s*Reweave all from your idea\s*</, '  and one Reweave all from your idea');
    assert.doesNotMatch(tale, /reweave this|Reweave it\b/, '  and no other word for it');
    assert.doesNotMatch(tale, /data-sp="setting"|data-sp="opensWith"/, 'WIZ-ONE-HOME: the setting is not asked on The tale');

    POSTED.length = 0;
    click({ sparkstep: '2' });
    await settle(/data-sp="persona"/);
    assert.match(html('page'), /data-sp="persona"/, 'WIZ-YOU: the You step asks who you play');
    assert.match(html('page'), /data-sp="personaAbout"/, '  and who they are, if they are new');
    assert.doesNotMatch(html('page'), /Nothing has been written yet/, 'WIZ-NO-FOOTER: the footer no longer says nothing has been written');
    // WIZ-HOLD (#95): the press that holds the one you play, and Hands off's offer of them, follow
    // the name as it is typed. Both were drawn only from the name the step opened with, so a writer
    // who typed one saw neither until they left the step and came back.
    assert.doesNotMatch(html('page'), /Mara Voss/, 'WIZ-HOLD: before the name is typed, nothing offers it');
    {
      const field = { dataset: { sp: 'persona' }, value: 'Mara Voss' };
      onScreen = { '[data-sp]': [field] };
      (listeners.change ?? []).forEach((f: Function) => f({ target: field }));
      onScreen = {};
      assert.match(html('page'), /data-splock="1"[^>]*>Also keep Mara Voss/, 'WIZ-HOLD: typing a name offers to hold them');
      assert.match(html('page'), /Mara Voss/, '  and Hands off offers them');
    }

    // A new character, described, and held. Leaving You for the threads asks for them.
    onScreen = { '[data-sp]': [{ dataset: { sp: 'persona' }, value: 'Mara Voss' },
      { dataset: { sp: 'personaAbout' }, value: 'a courier who owes the envoy' },
      { dataset: { sp: 'lockedCharacter' }, value: 'Mara Voss' }] };
    click({ sparkstep: '3' });
    onScreen = {};
    await settle(/Teodor Ash/);
    const cast = POSTED.find((p) => p.url === '/api/spark/cast');
    assert.ok(cast, 'WIZ-CAST: arriving at the threads asks for them');
    assert.strictEqual(cast.body.story.persona, 'Mara Voss', 'WIZ-CAST: with who you play');
    assert.strictEqual(cast.body.story.lockedCharacter, 'Mara Voss', '  and who is Hands off');
    assert.strictEqual(cast.body.story.personaAbout, 'a courier who owes the envoy', '  and what you said of them');

    // THE THREADS, AS A TALE'S THREADS LOOK (Seth, 2026-10-30): a row per thread that opens it, with
    // its keep tick and its Reweave; ＋ in the header; and the ways to bring threads in, folded.
    let th = html('page');
    assert.match(th, /<button class="card plate thplate" data-spopen="2"[^>]*>[\s\S]*?class="platename">Teodor Ash</,
      'WIZ-THREAD-ROWS: each thread is a row that opens it, as in a tale');
    assert.match(th, /data-spopen="2"[\s\S]*?2 pockets/, '  saying how many pockets it has');
    assert.doesNotMatch(th, /data-spname=|data-spbody=/, '  and no boxes to edit on the list itself');
    assert.match(th, /data-spcast="2"[\s\S]*?data-sprecast="2"[^>]*>\s*Reweave\s*</, '  each with its keep tick and its Reweave');
    assert.match(th, /<button[^>]*class="headadd"[^>]*data-spadd="1"/, 'WIZ-THREAD-ADD: Write one of your own is the ＋ in the header');
    const bring = foldOf(th, 'Bring threads in');
    assert.match(bring, /data-castpaste[\s\S]*data-pastecast="1"/, 'WIZ-BRING: the paste box and Read are in Bring threads in');
    assert.match(bring, /id="seedq"/, '  and the library search');
    assert.doesNotMatch(th, /data-spfollow/, 'WIZ-WORLD-HOME: the follow picker is not on The threads');
    const fixed = controls(bare(th)).filter((t) => !/data-sp(?:open|cast|recast)=/.test(t));
    assert.ok(fixed.length <= 8, `WIZ-THREADS-COUNT: about eight fixed controls on The threads (${fixed.length}: ${fixed.map((t) => t.slice(0, 40)).join(' | ')})`);

    // A THREAD OPENED: Always true first, where it stands, then its pockets as a tale's pocket rows.
    click({ spopen: '2' });
    th = html('page');
    assert.match(th, /data-spopen=""[^>]*class="headback"|class="headback"[^>]*data-spopen=""/, 'WIZ-THREAD-OPEN: an opened thread has a way back to the list');
    assert.match(th, /<textarea[^>]*data-spbody="2"[^>]*>\[Teodor Ash: a clerk who counts the dead\]</, '  its Always true, to change');
    assert.match(th, /data-spstands="2"/, '  and where it stands as the tale opens');
    assert.match(th, /<div class="pocketrow lit">\s*<button class="pocketopen" data-sppocketopen="2:voice"[\s\S]*?Envoy[\s\S]*?Write her lines formal and short\./,
      'WIZ-POCKETS: its pockets are pocket rows, each named, with a line of its text');
    assert.match(th, /data-sppocketopen="2:interiority"/, '  every one of them');
    assert.ok(th.indexOf('data-spbody="2"') < th.indexOf('data-sppocketopen="2:voice"'), '  Always true shown first');
    assert.match(th, /data-sppocketnew="2"/, '  and a press to add a pocket');

    // THE POCKET PANEL, ON THE DRAFT: open one, change it, Done; nothing posts. An open pocket saves
    // into the draft as you type (ADR 0004, pass three).
    click({ sppocketopen: '2:voice' });
    let panel = html('pocketPanel');
    assert.match(panel, /id="pk-name" value="Envoy"/, 'WIZ-POCKET-PANEL: a pocket row opens the pocket panel on it');
    assert.match(panel, /id="pk-body"[^>]*>Write her lines formal and short\.</, '  holding its words');
    assert.strictEqual(nodes.get('pocketPanel').hidden, false, '  shown');
    assert.doesNotMatch(panel, /data-sppocketsave|>Save</, 'WIZ-NO-SAVE: an open draft pocket has no Save');
    assert.match(panel, /data-pocketundo="1"[\s\S]*data-pocketdone="1"/, 'WIZ-FOOT: Undo my changes and Done in its foot');
    // Undo my changes, after the pause has written the change into the draft, puts the words back.
    typeIn('pk-body', 'Something she would never say.');
    await sleep(1000);
    click({ pocketundo: '1' }); click({ pocketundo: '1' }); await sleep(20);
    assert.strictEqual(nodes.get('pocketPanel').hidden, true, 'WIZ-UNDO-SHUT: Undo my changes shuts the panel');
    assert.match(html('page'), /Write her lines formal and short\./, 'WIZ-UNDO-MINE: and the draft has the words it opened with');
    assert.doesNotMatch(html('page'), /never say/, '  and not the ones typed');
    click({ sppocketopen: '2:voice' });
    typeIn('pk-body', 'Write her lines formal, and shorter.');
    click({ pocketdone: '1' }); await sleep(20);
    assert.strictEqual(nodes.get('pocketPanel').hidden, true, 'WIZ-EDIT: Done shuts the panel');
    assert.match(html('page'), /formal, and shorter/, '  and the change is in the draft');
    click({ sppocketopen: '2:interiority' });
    click({ sppocketdel: '1' });
    let pv = html('page');
    assert.doesNotMatch(pv, /Never let her say she is afraid/, 'WIZ-REMOVE: a pocket removed from the panel is gone');
    assert.match(pv, /data-spundo="1"/, '  and the removal can be undone, on The threads');
    click({ spundo: '1' });
    assert.match(html('page'), /Never let her say she is afraid/, 'WIZ-UNDO: undo brings it back');
    assert.match(html('page'), /formal, and shorter/, '  and keeps the edit made before it');
    click({ sppocketopen: '2:interiority' });
    click({ sppocketdel: '1' });
    // UNDO KEEPS AN EDIT MADE AFTER THE CHANGE IT TAKES BACK (review, 2026-10-27).
    click({ sppocketopen: '2:voice' });
    typeIn('pk-body', 'Write his lines formal and spare.');
    click({ pocketdone: '1' }); await sleep(20);
    click({ spundo: '1' });
    assert.match(html('page'), /formal and spare/, 'WIZ-UNDO: an edit typed after the removal survives its undo');
    assert.match(html('page'), /Never let her say she is afraid/, '  and the removed pocket is back');
    click({ sppocketopen: '2:interiority' });
    click({ sppocketdel: '1' });
    // A NEW POCKET: the ＋, a kind, a name and its words.
    click({ sppocketnew: '2' });
    panel = html('pocketPanel');
    assert.match(panel, /data-pocketkind="outfit"/, 'WIZ-ADD: the panel offers the kinds of pocket the thread has');
    assert.doesNotMatch(panel, /data-pocketkind="voice"/, '  and not one it has already');
    click({ pocketkind: 'outfit' });
    typeIn('pk-name', 'Grey wool');
    typeIn('pk-body', 'Dress her in grey wool.');
    // A PRESS THAT MAKES A THING SAYS ADD (Seth, 2026-10-30); one that keeps a change is Done.
    assert.match(html('pocketPanel'), /data-sppocketsave="1">Add</, 'ADD-SETUP: a new pocket in the setup is added by Add');
    click({ sppocketsave: '1' });
    assert.match(html('page'), /data-sppocketopen="2:outfit"[\s\S]*?Grey wool[\s\S]*?Dress her in grey wool/, 'WIZ-ADD: an added pocket is in the draft');

    // THE THREAD YOU PLAY STAYS while you play them (Seth, 2026-10-27), and the screen says why.
    click({ spopen: '1' });
    assert.doesNotMatch(html('page'), /data-spdropthread="1"/, 'WIZ-KEEP-YOU: no remove on the thread you play');
    assert.match(html('page'), /You play Mara Voss, so (?:her|their) thread stays/, '  and it says why');
    click({ spdropthread: '1' });
    assert.match(html('page'), /a courier who owes the envoy/, '  and a press that reaches the handler anyway removes nothing');
    // Remove Ring Law, undo, remove it again.
    click({ spopen: '3' });
    click({ spdropthread: '3' });
    assert.doesNotMatch(html('page'), /class="platename">Ring Law</, 'WIZ-DROP: a removed thread is gone');
    assert.match(html('page'), /data-spopen="2"/, '  and the list is back');
    click({ spundo: '1' });
    assert.match(html('page'), /class="platename">Ring Law</, 'WIZ-UNDO: undo brings the thread back');
    click({ spopen: '3' });
    click({ spdropthread: '3' });

    // THE THREAD YOU PLAY CANNOT BE UNTICKED on the threads step either (round-two review).
    onScreen = { '[data-spcast]': [{ dataset: { spcast: '1' }, checked: false }] };
    click({ sparkstep: '4' });
    onScreen = {};
    await settle(/The tale's own thread/);
    pv = html('page');
    assert.match(pv, /a courier who owes the envoy/, 'WIZ-KEEP-YOU: unticking the thread you play keeps it');
    // BEGIN: Try it on, then the preview, then who writes the opening, then Start writing.
    const at = (re: RegExp) => pv.search(re);
    assert.ok(at(/data-spreview="1"/) >= 0 && at(/data-spreview="1"/) < at(/The tale's own thread/)
      && at(/The tale's own thread/) < at(/data-sp-open="1"/) && at(/data-sp-open="1"/) < at(/data-accept-spark="1"/),
      'WIZ-BEGIN: Try it on first, then the preview, then the opening, then Start writing');
    const summary = /<div class="note" data-spsummary="1">([^<]*)<\/div>/.exec(pv);
    assert.ok(summary, 'WIZ-SUMMARY: Begin says what will be made in one line at the top');
    assert.match(summary![1], /The Winter Signature[\s\S]*3 threads[\s\S]*no World[\s\S]*Mara Voss/, `  naming the tale, its threads, its World and who you play (${summary?.[1]})`);
    assert.ok(at(/data-spsummary/) < at(/data-spreview="1"/), '  above Try it on');
    assert.match(pv, /The tale's own thread/, "WIZ-PREVIEW: the tale's own thread is at the top of the preview");
    assert.ok(pv.indexOf("The tale's own thread") < pv.indexOf('Teodor Ash'), '  above the threads');
    // THE PREVIEW READS: the title, premise and voice are text, each with a Change.
    assert.doesNotMatch(pv, /data-sp="(?:title|premise|writingStyle|idea|genre)"/, 'WIZ-READS: the preview does not edit the title, premise or voice again');
    assert.match(pv, /Six houses have one winter/, '  it reads the premise back');
    for (const k of ['title', 'premise', 'writingStyle'])
      assert.match(pv, new RegExp(`data-spchange="${k}"`), `  with a Change for the ${k}`);
    assert.doesNotMatch(pv, /data-sppocketopen|data-spdroppocket|data-spdropthread|data-spstands/, '  and its threads are read, not edited');
    // ONE HOME for the setting and the first scene's opening.
    assert.match(pv, /data-sp="setting"/, 'WIZ-ONE-HOME: the setting is asked on Begin');
    // A rule is a pocket of the tale since 2026-10-29 (ADR 0005): the preview offers no Rules from the cast.
    assert.doesNotMatch(pv, />Rules &middot;/, '  and no Rules from the cast');
    // ADR 0009 · THE OPEN QUESTIONS, offered ticked, each with its line; unticking one keeps it off.
    assert.match(pv, /<input type="checkbox" data-spquestion="0" checked>/, 'WIZ-QUESTIONS: the open questions are offered ticked');
    assert.match(pv, /<input type="checkbox" data-spquestion="1" checked>/, '  every one of them');
    assert.match(pv, /Who signs first[\s\S]*Each house waits for another to sign\./, '  with the title and its line');
    onScreen = { '[data-spquestion]': [{ dataset: { spquestion: '0' }, checked: true },
                                       { dataset: { spquestion: '1' }, checked: false }] };
    click({ sparkstep: '4' });
    onScreen = {};
    assert.match(html('page'), /<input type="checkbox" data-spquestion="1">/, 'WIZ-QUESTIONS: an unticked one stays unticked');
    // #121 · THE OPENING MOMENT, an editable box of its own, apart from the setting.
    const opensBox = /<textarea[^>]*data-sp="opensWith"[^>]*>([^<]*)<\/textarea>/.exec(pv);
    assert.ok(opensBox, 'WIZ-OPENS: Begin shows how the first scene opens as an editable box');
    assert.strictEqual(opensBox![1], 'The east gallery, the first frost; snow on the leads, a grey morning.',
      '  holding the moment the spark returned');
    onScreen = { '[data-sp]': [{ dataset: { sp: 'opensWith' }, value: 'The east gallery at noon; thaw.' }] };
    click({ sparkstep: '4' });
    onScreen = {};
    for (const t of ['Ilva Marren', 'Mara Voss', 'Teodor Ash', 'Road dust', 'Their lines are yours', 'Envoy', 'Grey wool'])
      assert.ok(pv.includes(t.replace(/'/g, '&#39;')), `WIZ-PREVIEW: every thread and pocket is listed: ${t}`);
    assert.doesNotMatch(pv, /Write his lines formal and spare/, 'WIZ-FOLD: a thread reads as its name, Always true and pocket names');
    assert.doesNotMatch(pv, /data-spvoicefix/, 'WIZ-WARN: a Voice that agrees is not warned about');
    // A thread on the preview opens it on The threads, where it is changed.
    click({ spopen: '2' });
    assert.match(html('page'), /data-spbody="2"/, 'WIZ-OPEN-FROM-BEGIN: a thread on Begin opens it on The threads');
    click({ sparkstep: '4' });
    // Change goes back to The tale, where the premise is written.
    click({ spchange: 'premise' });
    assert.match(html('page'), /data-sp="premise"/, 'WIZ-CHANGE: Change on the premise goes to The tale');

    // THE TALE'S OWN POCKETS ("Your own"): add, edit, remove, undo.
    click({ sparkstep: '4' });
    doc.querySelector = (sel: string) => sel === '[data-sptpnew="name"]' ? { value: 'Slow burn' }
      : sel === '[data-sptpnew="body"]' ? { value: 'Keep it a slow burn.' } : null;
    click({ spaddtp: '1' });
    doc.querySelector = wasQS;
    assert.match(html('page'), /data-sptpbody="0"/, 'WIZ-TALE-POCKET: a pocket of the tale\'s own is added');
    doc.querySelector = (sel: string) => sel === '[data-sptpnew="name"]' ? { value: 'Narrator' }
      : sel === '[data-sptpnew="body"]' ? { value: 'The narrator never names him.' } : null;
    click({ spaddtp: '1' });
    doc.querySelector = wasQS;
    onScreen = { '[data-sptpbody]': [{ dataset: { sptpbody: '0' }, value: 'Keep it a very slow burn.' }] };
    click({ spdroptp: '1' });
    onScreen = {};
    assert.doesNotMatch(html('page'), /never names him/, 'WIZ-TALE-POCKET: and removed');
    assert.match(html('page'), /very slow burn/, '  and edited');
    click({ spundo: '1' });
    assert.match(html('page'), /never names him/, '  and the removal undone');
    click({ spdroptp: '1' });

    // THE VOICE AGAINST THE POINT OF VIEW: written on The tale, warned on Begin, fixed, undone, and
    // Start writing still works.
    click({ sparkstep: '1' });
    onScreen = { '[data-sp]': [{ dataset: { sp: 'writingStyle' }, value: 'Cold, spare. Narrate in first person, present tense.' }] };
    click({ sparkstep: '4' });
    onScreen = {};
    pv = html('page');
    assert.match(pv, /data-spvoicefix="1"/, 'WIZ-WARN: a Voice in first person over a third-person tale is warned about');
    assert.match(pv, /first person, present tense/, '  naming what it says');
    click({ spvoicefix: '1' });
    assert.doesNotMatch(html('page'), /data-spvoicefix/, 'WIZ-FIX: the fix ends the warning');
    assert.match(html('page'), />Cold, spare\.</, '  and leaves the rest of the Voice');
    click({ spundo: '1' });
    assert.match(html('page'), /data-spvoicefix="1"/, '  and is undone like the rest');

    assert.ok(POSTED.every((p) => String(p.url).startsWith('/api/spark')),
      `WIZ-NOTHING: nothing is posted before Start writing (${POSTED.map((p) => p.url).join(', ')})`);
    doc.querySelector = (sel: string) => sel === '[data-sp-open]' ? { checked: false } : null;
    click({ acceptSpark: '1' });
    doc.querySelector = wasQS;
    for (let i = 0; i < 40 && !POSTED.some((p) => p.url === '/api/stories'); i++) await sleep(25);
    const made = POSTED.find((p) => p.url === '/api/stories');
    assert.ok(made, 'WIZ-CREATE: Start writing works with the warning showing');
    assert.match(made.body.writingStyle, /first person/, '  and keeps the Voice as the writer left it');
    assert.doesNotMatch(made.body.writingStyle, /frost/, 'VOICE-OFFER: the offered Voice is not sent when it was not chosen');
    assert.deepStrictEqual(made.body.entries.map((e: any) => e.title), ['Ilva Marren', 'Mara Voss', 'Teodor Ash'],
      'WIZ-CREATE: the draft goes as the threads step left it, the removed thread too');
    const ilva = made.body.entries[2];
    assert.strictEqual(ilva.rooms.voice.body, 'Write his lines formal and spare.', '  with the pocket changed in the pocket panel');
    assert.strictEqual(ilva.rooms.voice.name, 'Envoy', '  its name kept');
    assert.ok(!ilva.rooms.interiority, '  without the removed one');
    assert.deepStrictEqual(ilva.rooms.outfit, { on: true, name: 'Grey wool', body: 'Dress her in grey wool.' }, '  with the added one, on');
    assert.strictEqual(made.body.entries[1].rooms.voice.name, 'Their lines are yours', "  and the yours pocket on Mara's thread");
    assert.strictEqual(made.body.persona, 'Mara Voss', '  who you play');
    assert.strictEqual(made.body.lockedCharacter, 'Mara Voss', '  and Hands off');
    assert.strictEqual(made.body.personaAbout, 'a courier who owes the envoy', '  and what you said of them, for a thread if the cast made none');
    assert.deepStrictEqual(made.body.talePockets, [{ name: 'Slow burn', body: 'Keep it a very slow burn.' }],
      "WIZ-CREATE: and the tale's own pockets as the preview left them");
    assert.deepStrictEqual(made.body.strings, [{ title: 'Who signs first', line: 'Each house waits for another to sign.' }],
      'WIZ-CREATE-QUESTIONS: only the ticked open questions are sent, to be made as strings');
    assert.strictEqual(made.body.opensWith, 'The east gallery at noon; thaw.',
      "WIZ-CREATE-OPENS: the opening moment goes as the writer left it, for scene 1's Opens with");
    await sleep(60);
  } finally { doc.querySelectorAll = wasQSA; doc.querySelector = wasQS; }
}
ok('the wizard is four steps: the tale and its threads in folds and rows, and Begin reads the draft back');

// #117 · TRY IT ON'S CONTRADICTIONS, with Use this and Leave it, on the draft. Each shows both places
// and the fix; Use this changes the one place the fix names (Always true, where it stands, a pocket,
// or the premise) and nothing else; Leave it changes nothing; both take it off the list. Shown on Try
// it on, at the top of Begin, once. Nothing posts but the spark calls until Start writing.
{
  const doc = (globalThis as any).document;
  const wasQS = doc.querySelector;
  const settle = async (re: RegExp) => { for (let i = 0; i < 40 && !re.test(html('page')); i++) await sleep(25); };
  click({ railview: 'workspace' });
  await sleep(30);
  click({ nav: 'create' });
  await sleep(30);
  doc.getElementById = (id: string) => id === 'idea' ? { value: 'Six houses, one winter.' } : (nodes.get(id) ?? el(id));
  try { click({ spark: '1' }); await settle(/data-sp="premise"/); }
  finally { doc.getElementById = (id: string) => nodes.get(id) ?? el(id); }
  POSTED.length = 0;
  click({ sparkstep: '3' });
  await settle(/Teodor Ash/);
  click({ sparkstep: '4' });
  click({ spreview: '1' });
  await settle(/data-spfix/);
  let pg = html('page');
  // ONE LIST (Seth, 2026-10-30): Try it on is at the top of Begin, so its contradictions are shown once.
  assert.strictEqual((pg.match(/data-spfix="/g) ?? []).length, 4, 'CLASH-SHOWN: Try it on lists each contradiction with Use this, once');
  assert.strictEqual((pg.match(/data-spleave="/g) ?? []).length, 4, '  and Leave it');
  assert.match(pg, /Teodor Ash[^<]*Always true[\s\S]*a clerk who counts the dead[\s\S]*The premise[\s\S]*Six houses have one winter/,
    'CLASH-PLACES: both places, each with what it says');
  assert.match(pg, /The premise has six houses[\s\S]*Fix: Teodor Ash[^<]*Always true[\s\S]*A clerk of House Marren who counts the dead\./, '  why, and the fix');
  assert.match(pg, /The tale's own thread/, 'CLASH-BEGIN: on the same page as the preview');
  click({ spfix: '0' });   // Teodor's Always true
  click({ spfix: '0' });   // Mara's where it stands
  click({ spleave: '0' }); // the premise: left
  click({ spfix: '0' });   // Teodor's voice pocket
  pg = html('page');
  assert.doesNotMatch(pg, /data-spfix=|data-spleave=/, 'CLASH-DONE: each one pressed leaves the list');
  assert.match(pg, /A clerk of House Marren who counts the dead\./, 'CLASH-USE: Use this changes the Always true it names');
  assert.match(pg, /Six houses have one winter to sign a peace none of them wants\./, 'CLASH-LEAVE: Leave it changes nothing');
  click({ spopen: '1' });
  assert.match(html('page'), /data-spstands="1"[^>]*>Waits at the hall gate for Teodor\.</, 'CLASH-USE: where she stands is changed, and shown to edit on The threads');
  click({ spopen: '' });
  // Where a thread stands is the writer's to edit on the thread, opened on The threads.
  const wasQSA = doc.querySelectorAll;
  click({ spopen: '2' });
  doc.querySelectorAll = (sel: string) => sel === '[data-spstands]' ? [{ dataset: { spstands: '2' }, value: 'Counting the dead at the gate.' }] : [];
  click({ spopen: '' });
  doc.querySelectorAll = wasQSA;
  assert.ok(POSTED.every((p) => String(p.url).startsWith('/api/spark')), `CLASH-NOTHING: nothing posts but the spark calls (${POSTED.map((p) => p.url).join(', ')})`);
  doc.querySelector = (sel: string) => sel === '[data-sp-open]' ? { checked: false } : null;
  click({ acceptSpark: '1' });
  doc.querySelector = wasQS;
  for (let i = 0; i < 40 && !POSTED.some((p) => p.url === '/api/stories'); i++) await sleep(25);
  const made = POSTED.find((p) => p.url === '/api/stories');
  assert.ok(made, 'CLASH-CREATE: the tale is made');
  const by = (t: string) => made.body.entries.find((e: any) => e.title === t);
  assert.strictEqual(by('Teodor Ash').body, 'A clerk of House Marren who counts the dead.', 'CLASH-CREATE: with the fixed Always true');
  assert.strictEqual(by('Teodor Ash').rooms.voice.body, 'Formal, and he counts aloud.', '  the fixed pocket');
  assert.strictEqual(by('Teodor Ash').rooms.voice.name, 'Envoy', '  its name kept');
  assert.strictEqual(by('Mara Voss').stands, 'Waits at the hall gate for Teodor.', '  and where she stands');
  assert.strictEqual(by('Teodor Ash').stands, 'Counting the dead at the gate.', 'CLASH-EDIT: where a thread stands, edited on the thread, is sent');
  assert.strictEqual(made.body.premise, 'Six houses have one winter to sign a peace none of them wants.', '  and the premise left alone');
  await sleep(60);
}
ok("Try it on's contradictions are shown with both places and a fix, and Use this changes only the draft");

// #100 · TALK WHILE A TALE IS SET UP. The same Talk window, on the draft: what comes back as asked is
// applied to the draft at once, each with an Undo the page holds; what is offered has an Add press;
// a box the writer typed in on this step is changed only when that turn named it; and nothing posts
// but the spark calls, so Discard leaves nothing behind.
{
  const doc = (globalThis as any).document;
  const wasQSA = doc.querySelectorAll;
  let onScreen: Record<string, any[]> = {};
  const settle = async (re: RegExp, id = 'page') => { for (let i = 0; i < 40 && !re.test(html(id)); i++) await sleep(25); };
  const sparkTalks = () => POSTED.filter((p) => p.url === '/api/spark/talk');
  const ask = async (said: string) => {
    (document as any).getElementById('input').value = said;
    const n = sparkTalks().length;
    click({ send: '1' });
    for (let i = 0; i < 40 && sparkTalks().length === n; i++) await sleep(25);
    await sleep(40);
    return sparkTalks().at(-1);
  };
  const ORIGINAL = 'Six houses have one winter to sign a peace none of them wants.';
  const DARKER = 'Six houses, one winter, and every one of them lies.';
  const FERRY = { title: 'The Ferryman', entryType: 'character', activation: 'always_on',
    body: '[The Ferryman: rows the dead across for a coin]', keys: ['The Ferryman'] };
  click({ railview: 'workspace' });
  await sleep(30);
  click({ nav: 'create' });
  await sleep(30);
  doc.getElementById = (id: string) => id === 'idea' ? { value: 'Six houses, one winter.' } : (nodes.get(id) ?? el(id));
  try { click({ spark: '1' }); await settle(/data-sp="premise"/); }
  finally { doc.getElementById = (id: string) => nodes.get(id) ?? el(id); }
  doc.querySelectorAll = (sel: string) => onScreen[sel] ?? [];
  POSTED.length = 0;
  try {
    assert.match(html('page'), /data-panel="anansi"/, 'SETUP-TALK-OPEN: the setup step has a Talk press');
    click({ panel: 'anansi' });
    await settle(/id="input"/, 'dockCol');
    assert.strictEqual(nodes.get('side').hidden, true, 'SETUP-TALK-OPEN: Talk is not a drawer beside the setup step');
    assert.strictEqual(nodes.get('dock').hidden, false, 'SETUP-TALK-OPEN: it is the composer, over the step');
    assert.match(html('dockCol'), /id="input"/, 'SETUP-TALK-OPEN: with its box');

    // FILL IN THE TALE FROM THE TALK (Seth, 2026-10-30: "talk to anansi, get as much about a story set
    // and have it fill in whatever is needed"). Once there is a conversation, one press asks for it.
    assert.doesNotMatch(html('dockCol'), /data-fillsetup/, 'SETUP-FILL: no Fill in before anything is said');
    stubSparkTalk = { reply: 'Ask me anything.', seconds: 1 };
    await ask('A ferry town on a dead river.');
    assert.match(html('dockCol'), /data-fillsetup="1"/, 'SETUP-FILL: once there is a conversation, a Fill in the tale press');
    const before = sparkTalks().length;
    click({ fillsetup: '1' });
    for (let i = 0; i < 40 && sparkTalks().length === before; i++) await sleep(25);
    await sleep(40);
    assert.match(String(sparkTalks().at(-1)?.body.said ?? ''), /Fill in everything the tale still needs/, 'SETUP-FILL: it asks Anansi to fill in what is empty');
    click({ clearchat: '1' }); await sleep(20);

    // ASKED: a premise change and a new thread, applied to the draft at once; and an offer.
    stubSparkTalk = { reply: 'Darker, and the ferryman is in.', seconds: 1,
      changes: [{ words: 'Changed the premise: “Six houses, one winter, and every one of them lies.”',
                  change: { op: 'tale.set', field: 'premise', key: 'premise', text: DARKER, before: ORIGINAL } },
                { words: 'Added a thread: The Ferryman, a character.', change: { op: 'thread.new', thread: FERRY } }],
      entries: [{ title: 'House Marren', entryType: 'lore', activation: 'always_on',
        body: '[House Marren: holds the northern passes]', keys: ['House Marren'] }] };
    const sent = await ask('Make the premise darker and add the ferryman');
    assert.ok(sent, 'SETUP-TALK-SENDS: the ask goes to the setup route');
    assert.strictEqual(sent.body.storyId, undefined, 'SETUP-TALK-SENDS: naming no tale');
    assert.strictEqual(sent.body.draft.story.premise, ORIGINAL, 'SETUP-TALK-SENDS: with the draft');
    assert.match(sent.body.step, /^The tale/, `SETUP-TALK-SENDS: and the step the writer is on (${sent.body.step})`);
    assert.match(html('page'), new RegExp(DARKER), 'SETUP-TALK-APPLIED: the setup step shows the new premise at once');
    const side = html('dockCol');
    assert.match(side, /Changed the premise/, 'SETUP-TALK-LINES: each change is a line in the conversation');
    assert.match(side, /data-talkundo="1:0"/, 'SETUP-TALK-LINES: with its Undo');
    // #122 · the premise line shows the premise before against the premise now; the new thread
    // replaced nothing, so the conversation holds that one diff and no other.
    const { diffHTML: setupDiff } = await import('../web/model.js');
    assert.ok(side.includes(setupDiff(ORIGINAL, DARKER)), 'SETUP-TALK-DIFF: the premise line is a diff of the premise');
    assert.strictEqual([...side.matchAll(/class="diff"/g)].length, 1, 'SETUP-TALK-DIFF: and the new thread has none');
    const add = side.match(/data-talkadd="([^"]+)"/);
    assert.ok(add, `SETUP-TALK-ADD: the offer has an Add press:\n${side.slice(0, 900)}`);
    assert.match(side, /House Marren/, 'SETUP-TALK-ADD: naming what is offered');

    // UNDO: the premise goes back to exactly what it was.
    click({ talkundo: '1:0' });
    await sleep(30);
    assert.doesNotMatch(html('page'), new RegExp(DARKER), 'SETUP-TALK-UNDO: Undo takes the change back');
    assert.match(html('page'), new RegExp(ORIGINAL), 'SETUP-TALK-UNDO: and puts back exactly what was there');
    assert.match(html('dockCol'), /Undone/, 'SETUP-TALK-UNDO: and the line says so');

    // What was offered and not added rides back in the turns, so "add them" can be asked for later.
    stubSparkTalk = { reply: 'Yes.', seconds: 1 };
    let next = await ask('Tell me about them');
    assert.match(next.body.turns.map((t: any) => t.text).join('\n'), /Offered: House Marren \(lore\): \[House Marren: holds/,
      'SETUP-TALK-OFFERED: what was offered rides in the turns, so "add them" can be asked for later');

    // ADD: the offer goes into the draft; its own Undo takes it out again.
    click({ talkadd: add![1] });
    await sleep(30);
    next = await ask('Does that hold together?');
    let titles = next.body.draft.entries.map((e: any) => e.title);
    assert.ok(titles.includes('House Marren'), `SETUP-TALK-ADD: Add puts the offer in the draft (${titles})`);
    assert.ok(titles.includes('The Ferryman'), `SETUP-TALK-APPLIED: and the thread Talk added is in it (${titles})`);
    const addLine = html('dockCol').match(/Added a thread: House Marren[\s\S]*?data-talkundo="([^"]+)"/);
    assert.ok(addLine, 'SETUP-TALK-ADD: the Add is a line with its own Undo');
    click({ talkundo: addLine![1] });
    await sleep(30);
    next = await ask('And now?');
    titles = next.body.draft.entries.map((e: any) => e.title);
    assert.ok(!titles.includes('House Marren'), `SETUP-TALK-ADD-UNDO: Undo takes the added thread out (${titles})`);
    assert.ok(titles.includes('The Ferryman'), 'SETUP-TALK-ADD-UNDO: and nothing else');

    // A BOX THE WRITER TYPED IN on this step is not changed by a turn that did not name it...
    // Typed: an input event from the premise box, and the box holding what was typed when it is read.
    const typed = { dataset: { sp: 'premise' }, value: 'My own premise, typed.', id: 'f-sp-premise', rows: 1,
      scrollHeight: 0, style: {}, closest: () => null, getBoundingClientRect: () => ({ top: 0, bottom: 0, height: 0 }) };
    (listeners.input ?? []).forEach((f: Function) => f({ target: typed }));
    onScreen = { '[data-sp]': [typed] };
    stubSparkTalk = { reply: 'Here is a better one.', seconds: 1,
      changes: [{ words: 'Changed the premise: “Better.”', change: { op: 'tale.set', field: 'premise', key: 'premise', text: 'Better.',
        before: 'My own premise, typed.' } }] };
    await ask('Who is in this tale?');
    onScreen = {};
    assert.match(html('page'), /My own premise, typed\./, 'SETUP-TALK-TYPED: a box the writer typed in is kept');
    assert.doesNotMatch(html('page'), />Better\.</, 'SETUP-TALK-TYPED: and the change is not applied');
    assert.match(html('dockCol'), /Not done[^<]*premise/, 'SETUP-TALK-TYPED: and the conversation says why');
    // ...and is changed by one that asks for it.
    await ask('Rewrite my premise, please');
    assert.match(html('page'), />Better\.</, 'SETUP-TALK-TYPED-ASKED: asked for by name, it is changed');

    // ...on ANY step: typed on the tale's step, then the writer moved on, and the box is still theirs.
    const typed2 = { ...typed, value: 'Typed, then I moved on.' };
    (listeners.input ?? []).forEach((f: Function) => f({ target: typed2 }));
    onScreen = { '[data-sp]': [typed2] };
    click({ sparkstep: '3' });
    await sleep(30);
    onScreen = {};
    stubSparkTalk = { reply: 'A sharper one.', seconds: 1,
      changes: [{ words: 'Changed the premise: “Worse.”', change: { op: 'tale.set', field: 'premise', key: 'premise', text: 'Worse.',
        before: 'Typed, then I moved on.' } }] };
    const elsewhere = await ask('Who else is in it?');
    assert.match(elsewhere.body.step, /^The threads/, `SETUP-TALK-TYPED-ANY-STEP: asked from another step (${elsewhere.body.step})`);
    assert.match(html('dockCol'), /A sharper one\.[\s\S]*Not done[^<]*premise/, 'SETUP-TALK-TYPED-ANY-STEP: the conversation says why');
    stubSparkTalk = { reply: 'Yes.', seconds: 1 };
    const after = await ask('Anything else?');
    assert.strictEqual(after.body.draft.story.premise, 'Typed, then I moved on.',
      'SETUP-TALK-TYPED-ANY-STEP: a box typed in on an earlier step is not changed unasked');

    // ONE MAPPING: the page writes what the server checked. The changes are the real `checkDraft`'s,
    // against the draft the page just sent: an Always true that arrives with the name in front, and
    // the voice, which the draft keeps as `writingStyle`.
    const { checkDraft } = await import('../src/changes.ts');
    const checked = [
      checkDraft({ op: 'thread.set', thread: 'The Ferryman', room: 'none', text: 'The Ferryman: rows twice for a liar.' }, after.body.draft),
      checkDraft({ op: 'tale.set', field: 'voice', text: 'Wet and slow.' }, after.body.draft),
    ].map((k: any) => { assert.ok(k.ok, `ONE-MAPPING: the server takes it (${k.why})`); return k.change; });
    stubSparkTalk = { reply: 'Done.', seconds: 1, changes: checked.map((change: any) => ({ words: 'Changed.', change })) };
    await ask('Change the Ferryman and the voice');
    // #122 · the Always true line reads the old Always true against the new, as the server checked them.
    assert.ok(html('dockCol').includes(setupDiff(checked[0].before ?? '', 'rows twice for a liar.')),
      'SETUP-TALK-DIFF: a thread change\'s line is a diff of the text the server checked');
    stubSparkTalk = { reply: 'Yes.', seconds: 1 };
    const mapped = (await ask('And?')).body.draft;
    const ferry = mapped.entries.find((e: any) => e.title === 'The Ferryman');
    assert.strictEqual(ferry.body, checked[0].body, `ONE-MAPPING: the page writes the Always true the server checked (${ferry.body})`);
    assert.strictEqual(ferry.body, 'rows twice for a liar.', 'ONE-MAPPING: the description only, with no brackets and no name in front (#110)');
    assert.strictEqual(mapped.story[checked[1].key], 'Wet and slow.', 'ONE-MAPPING: the voice lands where the server says it lives');
    assert.strictEqual(checked[1].key, 'writingStyle', 'ONE-MAPPING: which is the draft\'s writingStyle');

    // DISCARD: nothing was ever posted but the spark calls, and Talk goes with the draft.
    assert.ok(POSTED.every((p) => String(p.url).startsWith('/api/spark')),
      `SETUP-TALK-NOTHING: nothing is saved before Start (${POSTED.map((p) => p.url).join(', ')})`);
    click({ dropSpark: '1' });
    await sleep(30);
    assert.strictEqual(nodes.get('dock').hidden, true, 'SETUP-TALK-DISCARD: Talk closes with the draft');
    assert.ok(POSTED.every((p) => String(p.url).startsWith('/api/spark')), 'SETUP-TALK-DISCARD: and Discard posts nothing');
  } finally { doc.querySelectorAll = wasQSA; stubSparkTalk = null; }
}
ok('Talk on a setup step changes the draft with Undo, adds offers, keeps a typed box, and saves nothing');

// #103 · AN IP THE WRITER ALREADY HAS A WORLD FOR. Named on the tale's own step, it makes the new
// tale follow that World; the preview lists the World's people; nothing posts but the spark calls
// until Start writing, and Start writing sends the follow in the one create, not a second save. An
// IP with no World of that name is kept as the World field alone, and a blank IP sends neither.
{
  const doc = (globalThis as any).document;
  const wasQSA = doc.querySelectorAll, wasQS = doc.querySelector;
  const settle = async (re: RegExp) => { for (let i = 0; i < 40 && !re.test(html('page')); i++) await sleep(25); };
  let onScreen: Record<string, any[]> = {};
  const startWizard = async () => {
    click({ railview: 'workspace' });
    await sleep(30);
    click({ nav: 'create' });
    await sleep(30);
    doc.getElementById = (id: string) => id === 'idea' ? { value: 'Six houses, one winter.' } : (nodes.get(id) ?? el(id));
    try { click({ spark: '1' }); await settle(/data-sp="premise"/); }
    finally { doc.getElementById = (id: string) => nodes.get(id) ?? el(id); }
  };
  const create = async () => {
    const n = POSTED.length;
    click({ acceptSpark: '1' });
    for (let i = 0; i < 40 && !POSTED.slice(n).some((p) => p.url === '/api/stories'); i++) await sleep(25);
    await sleep(60);
    return POSTED.slice(n);
  };
  doc.querySelectorAll = (sel: string) => onScreen[sel] ?? [];
  try {
    await startWizard();
    POSTED.length = 0;
    assert.match(html('page'), /data-sp="world"/, 'IP-ASK: the tale\'s own step asks whether it is set somewhere that exists');
    onScreen = { '[data-sp]': [{ dataset: { sp: 'world' }, value: '  elden RING ' }] };
    click({ sparkstep: '2' });
    onScreen = {};
    for (let i = 0; i < 40 && !POSTED.some((p) => p.url === '/api/spark/world'); i++) await sleep(25);
    assert.strictEqual(POSTED.find((p) => p.url === '/api/spark/world')?.body.name, 'elden RING',
      'IP-LOOK: leaving the step looks the IP up among the writer\'s Worlds');
    click({ sparkstep: '4' });
    await settle(/Morgott/);
    const pv = html('page');
    assert.match(pv, /Elden Ring/, 'IP-PREVIEW: the preview names the World the tale follows');
    assert.match(pv, /Morgott/, '  and lists its people');
    assert.match(pv, /the Omen King/, '  each with their Always true');
    assert.ok(POSTED.every((p) => String(p.url).startsWith('/api/spark')),
      `IP-NOTHING: nothing is made before Start writing (${POSTED.map((p) => p.url).join(', ')})`);
    // #107 · THE BEGIN STEP SAYS WHICH WORLD THE TALE FOLLOWS, beside everything else it will make.
    click({ sparkstep: '4' });
    await settle(/data-spsummary/);
    assert.match(html('page'), /data-spsummary="1">[^<]*follows Elden Ring/,
      'BEGIN-WORLD: the Begin step names the World the tale follows');
    const sent = await create();
    const made = sent.find((p) => p.url === '/api/stories');
    assert.strictEqual(made?.body.loreFrom, 'w-ring', 'IP-CREATE: Start writing makes the tale follow the World');
    assert.strictEqual(made?.body.world, 'elden RING', '  and names the IP');
    assert.ok(!sent.some((p) => p.body?.loreFrom !== undefined && p.url !== '/api/stories'),
      'IP-ONE: the follow rides the one create, not a second save after it');

    // An IP with no World of that name: the World field alone, as before #103. #104 looks it up.
    await startWizard();
    onScreen = { '[data-sp]': [{ dataset: { sp: 'world' }, value: 'Dune' }] };
    click({ sparkstep: '4' });
    onScreen = {};
    await settle(/The tale's own thread/);
    await sleep(40);
    assert.doesNotMatch(html('page'), /Morgott/, 'IP-NONE: an IP with no World of that name brings nobody in');
    const none = (await create()).find((p) => p.url === '/api/stories');
    assert.deepStrictEqual([none?.body.world, none?.body.loreFrom ?? null], ['Dune', null],
      '  and is kept as the World field, following nothing');

    // Skip from the tale's own step: no move looked the IP up, so Create does.
    await startWizard();
    onScreen = { '[data-sp]': [{ dataset: { sp: 'world' }, value: 'Elden Ring' }] };
    const skipped = (await create()).find((p) => p.url === '/api/stories');
    onScreen = {};
    assert.strictEqual(skipped?.body.loreFrom, 'w-ring', 'IP-SKIP: Skip from the first step still follows the World');

    // A lookup that fails is asked again on the next move, not read as "no World of that name".
    await startWizard();
    worldDown = 1;
    onScreen = { '[data-sp]': [{ dataset: { sp: 'world' }, value: 'Elden Ring' }] };
    click({ sparkstep: '2' });
    onScreen = {};
    for (let i = 0; i < 40 && worldDown > 0; i++) await sleep(25);
    await sleep(40);
    click({ sparkstep: '4' });
    await settle(/Morgott/);
    assert.match(html('page'), /Morgott/, 'IP-RETRY: a failed lookup is asked again on the next move');
    await create();

    // A blank IP: an original tale, as today.
    await startWizard();
    click({ sparkstep: '4' });
    await settle(/data-spsummary/);
    assert.match(html('page'), /data-spsummary="1">[^<]*follows no World/,
      'BEGIN-NO-WORLD: with no IP the Begin step says the tale follows no World');
    const blank = (await create()).find((p) => p.url === '/api/stories');
    assert.deepStrictEqual([blank?.body.world ?? null, blank?.body.loreFrom ?? null], [null, null],
      'IP-BLANK: a blank IP starts an original tale, following nothing');
  } finally { doc.querySelectorAll = wasQSA; doc.querySelector = wasQS; }
}
ok('a new tale naming an IP the writer has a World for follows it, shows its people, and makes nothing until Start');

// #101 · NAMING AN IP IN TALK DURING SETUP HANDS OVER TO THE WORLD STEP. The change sets the tale's
// World field, and the page runs the same World step the field's own box runs: the writer's World of
// that name is followed. Its Undo lets go of it again. Nothing is saved.
{
  const doc = (globalThis as any).document;
  const wasQSA = doc.querySelectorAll;
  const settle = async (re: RegExp, id = 'page') => { for (let i = 0; i < 40 && !re.test(html(id)); i++) await sleep(25); };
  const looked = () => POSTED.filter((p) => p.url === '/api/spark/world').map((p) => p.body.name);
  click({ railview: 'workspace' });
  await sleep(30);
  click({ nav: 'create' });
  await sleep(30);
  doc.getElementById = (id: string) => id === 'idea' ? { value: 'A queen for the Omen King.' } : (nodes.get(id) ?? el(id));
  try { click({ spark: '1' }); await settle(/data-sp="premise"/); }
  finally { doc.getElementById = (id: string) => nodes.get(id) ?? el(id); }
  doc.querySelectorAll = () => [];
  POSTED.length = 0;
  try {
    click({ panel: 'anansi' });
    await settle(/id="input"/, 'dockCol');
    stubSparkTalk = { reply: 'Elden Ring it is.', seconds: 1,
      changes: [{ words: 'Set in Elden Ring.', change: { op: 'tale.set', field: 'world', key: 'world', text: 'Elden Ring', before: '' } }] };
    (document as any).getElementById('input').value = 'It is set in Elden Ring';
    click({ send: '1' });
    for (let i = 0; i < 40 && !looked().length; i++) await sleep(25);
    assert.deepStrictEqual(looked(), ['Elden Ring'], 'SETUP-IP-HANDOVER: the World step looks the IP up among the writer\'s Worlds');
    click({ sparkstep: '4' });
    await settle(/data-spsummary/);
    assert.match(html('page'), /data-spsummary="1">[^<]*follows Elden Ring/,
      'SETUP-IP-HANDOVER: and the tale follows the World of that name');
    // Undone where the writer stands, with no move to another step: the Begin step says it at once.
    click({ talkundo: '1:0' });
    await settle(/follows no World/);
    assert.match(html('page'), /data-spsummary="1">[^<]*follows no World/,
      'SETUP-IP-UNDO: Undo lets go of the World again');
    // A World box the writer typed in is still changed by a turn that names the IP it is changed to.
    (listeners.input ?? []).forEach((f: Function) => f({ target: { dataset: { sp: 'world' }, value: 'Dune' } }));
    stubSparkTalk = { reply: 'Elden Ring, then.', seconds: 1,
      changes: [{ words: 'Set in Elden Ring.', change: { op: 'tale.set', field: 'world', key: 'world', text: 'Elden Ring', before: '' } }] };
    (document as any).getElementById('input').value = 'No, make it Elden Ring';
    click({ send: '1' });
    await settle(/follows Elden Ring/);
    assert.match(html('page'), /data-spsummary="1">[^<]*follows Elden Ring/,
      'SETUP-IP-TYPED: naming the IP is asking for the World box by name');
    assert.ok(POSTED.every((p) => String(p.url).startsWith('/api/spark')),
      `SETUP-IP-NOTHING: nothing is saved (${POSTED.map((p) => p.url).join(', ')})`);
    click({ dropSpark: '1' });
    await sleep(30);
  } finally { doc.querySelectorAll = wasQSA; stubSparkTalk = null; }
}
ok('naming an IP in Talk during setup starts the World step, and its Undo lets go of the World');

// #104 · AN IP WITH NO WORLD OF THAT NAME IS LOOKED UP. The threads step lists its people and places
// with a line each, ticked; more can be asked for and a name added; the preview shows the ticked
// ones; nothing is made until Start writing, which sends the ticked names as the new World. Names
// from memory are marked so in the list and the preview. A failed lookup offers going on without.
{
  const doc = (globalThis as any).document;
  const wasQSA = doc.querySelectorAll, wasQS = doc.querySelector;
  const settle = async (re: RegExp) => { for (let i = 0; i < 40 && !re.test(html('page')); i++) await sleep(25); };
  const changeIn = (target: any) => (listeners.change ?? []).forEach((f: Function) => f({ target }));
  let onScreen: Record<string, any[]> = {};
  const startWizard = async () => {
    click({ railview: 'workspace' });
    await sleep(30);
    click({ nav: 'create' });
    await sleep(30);
    doc.getElementById = (id: string) => id === 'idea' ? { value: 'Six houses, one winter.' } : (nodes.get(id) ?? el(id));
    try { click({ spark: '1' }); await settle(/data-sp="premise"/); }
    finally { doc.getElementById = (id: string) => nodes.get(id) ?? el(id); }
  };
  const create = async () => {
    const n = POSTED.length;
    click({ acceptSpark: '1' });
    for (let i = 0; i < 40 && !POSTED.slice(n).some((p) => p.url === '/api/stories'); i++) await sleep(25);
    await sleep(60);
    return POSTED.slice(n);
  };
  const nameIp = async (name: string) => {
    onScreen = { '[data-sp]': [{ dataset: { sp: 'world' }, value: name }] };
    click({ sparkstep: '3' });
    onScreen = {};
  };
  const casts = () => POSTED.filter((p) => p.url === '/api/spark/world/cast');
  doc.querySelectorAll = (sel: string) => onScreen[sel] ?? [];
  try {
    await startWizard();
    POSTED.length = 0;
    await nameIp('Dune');
    await settle(/Arrakis/);
    let page = html('page');
    assert.strictEqual(casts()[0]?.body.world, 'Dune', 'IP-LOOKUP: an IP with no World of that name is looked up');
    assert.match(page, /A new World, Dune/, 'IP-LIST: the threads step offers a new World of it');
    assert.match(page, /Paul Atreides[\s\S]*Heir of House Atreides/, '  each name with its line');
    assert.match(page, /data-ippick="1" checked/, '  ticked to begin with');
    assert.doesNotMatch(page, /from memory/, '  and a looked-up name is not marked from memory');
    click({ iplook: 'more' });
    await settle(/Chani/);
    assert.deepStrictEqual(casts().at(-1)?.body.more, ['Paul Atreides', 'Arrakis'], 'IP-MORE: asking for more names what is listed');
    assert.match(html('page'), /Chani/, '  and adds what comes back');
    doc.querySelector = (sel: string) => sel === '[data-ipname]' ? { value: 'Duncan Idaho' }
      : sel === '[data-ipkind]' ? { value: 'character' } : wasQS.call(doc, sel);
    click({ ipadd: '1' });
    doc.querySelector = wasQS;
    await settle(/Duncan Idaho/);
    assert.match(html('page'), /Duncan Idaho/, 'IP-ADD: a name can be added by hand');
    changeIn({ dataset: { ippick: '1' }, checked: false });
    click({ sparkstep: '4' });
    await settle(/A new World, Dune/);
    page = html('page');
    for (const n of ['Paul Atreides', 'Chani', 'Duncan Idaho']) assert.match(page, new RegExp(n), `IP-PREVIEW: the preview shows ${n}`);
    assert.doesNotMatch(page, /The desert planet/, 'IP-PREVIEW: and not Arrakis, who was unticked');
    assert.ok(POSTED.every((p) => String(p.url).startsWith('/api/spark')),
      `IP-NOTHING: nothing is made before Start writing (${POSTED.map((p) => p.url).join(', ')})`);
    click({ sparkstep: '4' });
    await settle(/data-spsummary/);
    assert.match(html('page'), /data-spsummary="1">[^<]*follows a new World, Dune, of 3 threads/,
      'BEGIN-NEW-WORLD: the Begin step names the new World and how many threads it gets');
    const sent = await create();
    const made = sent.find((p) => p.url === '/api/stories');
    assert.deepStrictEqual(made?.body.newWorld, { title: 'Dune', threads: [
      { name: 'Paul Atreides', kind: 'character', memory: false }, { name: 'Chani', kind: 'character', memory: false },
      { name: 'Duncan Idaho', kind: 'character', memory: false }] },
      'IP-CREATE: Start writing sends the ticked names, and only those, as the new World');
    assert.deepStrictEqual([made?.body.world, made?.body.loreFrom ?? null], ['Dune', null], '  in the one create');

    // FROM MEMORY: marked in the list and the preview, and sent so.
    await startWizard();
    await nameIp('Sunless Sea');
    await settle(/Fallen London/);
    assert.strictEqual((html('page').match(/from memory, not looked up/g) ?? []).length, 2,
      'IP-MEMORY: each name from memory is marked so in the list');
    click({ sparkstep: '4' });
    await settle(/A new World, Sunless Sea/);
    assert.strictEqual((html('page').match(/from memory, not looked up/g) ?? []).length, 2, 'IP-MEMORY: and in the preview');
    const mem = (await create()).find((p) => p.url === '/api/stories');
    assert.deepStrictEqual(mem?.body.newWorld?.threads.map((t: any) => t.memory), [true, true], 'IP-MEMORY: and sent so');

    // A FAILED LOOKUP: a press goes on with no World, and the tale starts without one.
    await startWizard();
    await nameIp('Nowhere');
    await settle(/Go on with no World/);
    assert.match(html('page'), /no engines are up/, 'IP-FAILED: a failed lookup says why');
    click({ ipwithout: '1' });
    await settle(/keeps the name only/);
    assert.match(html('page'), /keeps the name only/, 'IP-WITHOUT: the press says the tale goes on with no World');
    const without = (await create()).find((p) => p.url === '/api/stories');
    assert.deepStrictEqual([without?.body.world, without?.body.loreFrom ?? null, without?.body.newWorld ?? null], ['Nowhere', null, null],
      'IP-WITHOUT: going on with no World starts the tale without one');
    // And with a list on screen: the press drops the ticked names.
    await startWizard();
    await nameIp('Dune');
    await settle(/Arrakis/);
    click({ ipwithout: '1' });
    const dropped = (await create()).find((p) => p.url === '/api/stories');
    assert.deepStrictEqual([dropped?.body.world, dropped?.body.newWorld ?? null], ['Dune', null],
      'IP-WITHOUT: going on with no World sends no World, even with names ticked');
  } finally { doc.querySelectorAll = wasQSA; doc.querySelector = wasQS; }
}
ok('a new IP is looked up, ticked, added to and previewed, and only the ticked names become the World at Start');

// #107 · WHAT START WRITING BRINGS FROM THE LIBRARY, AND THE OPEN SWITCH, RIDE THE ONE CREATE. They
// were separate calls after the tale was made, outside its rollback, so a failure there left a
// half-made tale. Now the create carries both and nothing is posted after it.
{
  const doc = (globalThis as any).document;
  const wasQS = doc.querySelector;
  const settle = async (re: RegExp) => { for (let i = 0; i < 40 && !re.test(html('page')); i++) await sleep(25); };
  click({ railview: 'workspace' });
  await sleep(30);
  click({ nav: 'create' });
  await sleep(30);
  doc.getElementById = (id: string) => id === 'idea' ? { value: 'Six houses, one winter.' } : (nodes.get(id) ?? el(id));
  try { click({ spark: '1' }); await settle(/data-sp="premise"/); }
  finally { doc.getElementById = (id: string) => nodes.get(id) ?? el(id); }
  click({ sparkstep: '3' });   // the threads step reads the library for its picker
  await sleep(80);
  click({ seedpick: 'e-1' });
  doc.querySelector = (sel: string) => sel === '[data-sp-open]' ? { checked: false } : wasQS.call(doc, sel);
  try {
    const n = POSTED.length;
    click({ acceptSpark: '1' });
    for (let i = 0; i < 40 && !POSTED.slice(n).some((p) => p.url === '/api/stories'); i++) await sleep(25);
    await sleep(80);
    const sent = POSTED.slice(n);
    const made = sent.find((p) => p.url === '/api/stories');
    assert.deepStrictEqual(made?.body.seed, [{ storyId: 's-1', entryId: 'e-1' }],
      'CREATE-SEED: the picked thread rides the create, named by the tale it lives in');
    assert.strictEqual(made?.body.autoOpen, false, 'CREATE-OPEN: and so does Anansi writes it, turned off');
    assert.deepStrictEqual(sent.filter((p) => p.url === '/api/entry/copy' || p.url === '/api/story').map((p) => p.url), [],
      'CREATE-ONE: nothing is copied or saved after the create');
  } finally { doc.querySelector = wasQS; }
}
ok('the picked threads and the open switch are sent in the one create, and nothing after it');

// #105 · WORLD PEOPLE IN THE OPENING, AND WORLD PEOPLE ON YOU. The preview marks who of the World's
// people is in the opening, for a World the writer has and for a new one, and Start writing sends the
// marked names in the create. You offers the World's people to play and to keep Hands off.
{
  const doc = (globalThis as any).document;
  const wasQSA = doc.querySelectorAll;
  const settle = async (re: RegExp) => { for (let i = 0; i < 40 && !re.test(html('page')); i++) await sleep(25); };
  const changeIn = (target: any) => (listeners.change ?? []).forEach((f: Function) => f({ target }));
  let onScreen: Record<string, any[]> = {};
  const startIn = async (ip: string, step: string) => {
    click({ railview: 'workspace' });
    await sleep(30);
    click({ nav: 'create' });
    await sleep(30);
    doc.getElementById = (id: string) => id === 'idea' ? { value: 'Six houses, one winter.' } : (nodes.get(id) ?? el(id));
    try { click({ spark: '1' }); await settle(/data-sp="premise"/); }
    finally { doc.getElementById = (id: string) => nodes.get(id) ?? el(id); }
    onScreen = { '[data-sp]': [{ dataset: { sp: 'world' }, value: ip }] };
    click({ sparkstep: step });
    onScreen = {};
  };
  const create = async () => {
    const n = POSTED.length;
    click({ acceptSpark: '1' });
    for (let i = 0; i < 40 && !POSTED.slice(n).some((p) => p.url === '/api/stories'); i++) await sleep(25);
    await sleep(60);
    return POSTED.slice(n).find((p) => p.url === '/api/stories');
  };
  doc.querySelectorAll = (sel: string) => onScreen[sel] ?? [];
  try {
    // A World the writer has: Morgott is offered on You, then marked in the opening on the preview.
    await startIn('Elden Ring', '2');
    for (let i = 0; i < 40 && !/<option value="Morgott"/.test(html('page')); i++) {
      await sleep(25); click({ sparkstep: '2' }); }
    assert.match(html('page'), /id="f-sp-cast">[\s\S]*<option value="Morgott">/, 'YOU-WORLD: You play offers the World\'s people');
    assert.match(html('page'), /id="f-sp-lockedCharacter"[\s\S]*<option value="Morgott"/, 'YOU-WORLD-HELD: and so does Hands off');
    click({ sparkstep: '4' });
    await settle(/data-spopening="Morgott"/);
    assert.match(html('page'), /<input type="checkbox" data-spopening="Morgott"\s*>/, 'OPENING-MARK: the preview offers to mark him in the opening, unmarked');
    changeIn({ dataset: { spopening: 'Morgott' }, checked: true });
    click({ sparkstep: '4' });
    await settle(/data-spopening="Morgott" checked/);
    assert.match(html('page'), /data-spopening="Morgott" checked/, 'OPENING-KEPT: the mark is kept across a repaint');
    assert.deepStrictEqual((await create())?.body.inOpening, ['Morgott'], 'OPENING-SENT: Start writing sends him as in the opening');

    // A new World: its ticked people can be marked, and an unmarked or unticked one is not sent.
    await startIn('Dune', '4');
    await settle(/data-spopening="Paul Atreides"/);
    assert.doesNotMatch(html('page'), /data-spopening="Arrakis"/, 'OPENING-PEOPLE: a place is not offered as in the opening');
    changeIn({ dataset: { spopening: 'Paul Atreides' }, checked: true });
    const dune = await create();
    assert.deepStrictEqual(dune?.body.inOpening, ['Paul Atreides'], 'OPENING-NEW-WORLD: a new World\'s marked person is sent');
    assert.ok(dune?.body.newWorld, '  with the new World');

    // Nothing marked: nobody is sent.
    await startIn('Dune', '4');
    await settle(/data-spopening="Paul Atreides"/);
    assert.deepStrictEqual((await create())?.body.inOpening, [], 'OPENING-NONE: nobody marked, nobody sent');
  } finally { doc.querySelectorAll = wasQSA; }
}
ok('World people can be played, held and marked in the opening, and the marked ones ride the create');

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
  await sleep(40);
  click({ panel: 'threads' });
  click({ entry: 'e-1' });
  await sleep(30);
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
  // BY KIND INSIDE EACH SECTION (Seth, 2026-11-03): a heading for the kind, then its pockets. The
  // face and the Pockets tab draw it from one list (pocketList), so both are read here.
  const kindBefore = (html: string, kind: string, name: string) => {
    const h = html.search(new RegExp(`class="lbl pkgroup">${kind}<`)), n = html.indexOf(name);
    return h > 0 && n > h;
  };
  assert.ok(kindBefore(face, 'Voice', 'How she sounds'), 'POCKET-KINDS: an on pocket sits under its kind');
  assert.ok(kindBefore(face.slice(dividerAt), 'Interiority', 'What she wants'), 'POCKET-KINDS: and an off one under its kind, below Not turned on');
  click({ cardview: 'form' }); click({ cardtab: 'rooms' }); await sleep(30);
  assert.ok(kindBefore(html('sideBody'), 'Voice', 'How she sounds'), 'POCKET-KINDS: the Pockets tab groups them the same way');
  click({ alterdone: '1' }); await sleep(30);

  // §8 · READ SAYS WHAT IS TRUE; EDIT IS WHERE YOU CHANGE IT.
  click({ entry: 'e-done' });
  await sleep(30);
  const done = html('sideBody');
  assert.match(done, /Retired at scene 2/, 'the face marks a retired thread');
  assert.doesNotMatch(done, /data-unretire=/, 'and offers no control — that is what the form is for');
  assert.doesNotMatch(done, /data-retire=/, 'in either direction');

  click({ cardview: 'form' });
  const form = html('sideBody');
  // A RETIRED CARD MUST BE BRINGABLE BACK FROM SOMEWHERE. Moving the way back off the face means
  // the form is now one of the two places that has it — the waiting panel is the other, and
  // test/web.ts asserts that one for the same reason: a wrong press is otherwise invisible AND
  // permanent.
  assert.match(form, /data-unretire="e-done"/, 'the form brings it back');
  assert.match(form, /Retired at scene 2/, 'and says what it is bringing back from');

  click({ entry: 'e-1' });
  click({ cardview: 'form' });
  assert.match(html('sideBody'), /data-retire="e-1"/,
    'and a live card is finished from the same place, which is the asymmetry this fixed');
  click({ cardview: null });
}
ok('a card face reads body, then what is on, then what is not — and finishing lives in the form');

// ---- A SCENE IS DELETED FROM ITS OWN DRAWER, NOT FROM THE LIST (UX review, 2026-10-29). The ✕ on
// every card in Scenes sat right beside the card (36px) and was easy to hit by mistake. This scene
// keeps Delete, and it still asks twice.
{
  click({ open: 's-1' });
  await sleep(40);
  click({ panel: 'chapters' });
  const list = html('sideBody');
  assert.ok([...list.matchAll(/data-chapter="([^"]+)"/g)].length > 0, 'the list has scenes');
  assert.doesNotMatch(list, /data-delchapter=/, 'SCENE-DEL: no delete in the Scenes list');
  click({ panel: 'chapter' });
  const id = STORY.currentChapter.id;
  assert.match(html('sideBody'), new RegExp(`data-delchapter="${id}"`), 'SCENE-DEL: This scene has its delete');
  POSTED.length = 0;
  click({ delchapter: id });
  await sleep(30);
  assert.ok(!POSTED.some((x: any) => x.url === '/api/chapter' && x.method === 'DELETE'), 'SCENE-DEL: one press deletes nothing');
  // The armed press goes stale after four seconds, so nothing below inherits it.
  await sleep(4100);
}
ok('a scene is deleted from This scene, asking twice, and not from the Scenes list');

// ---- THIS SCENE: A DIRECTION, AND SOMETHING ELSE (2026-10-27) ----
{
  click({ open: 's-1' });
  await sleep(40);
  click({ panel: 'chapter' });
  const panel = html('sideBody');
  assert.match(panel, /data-chsteer="1"/, 'CH-STEER: This scene takes a direction for Anansi');
  // THE NAME UNDER ITS LABEL, THEN ANANSI'S HELPERS (UX review, 2026-10-29): the label sat over
  // "Have Anansi write these", a direction box and Something else, and only then the name.
  const at = (re: RegExp) => panel.search(re);
  assert.ok(at(/for="f-chapter-title"/) >= 0
    && at(/for="f-chapter-title"[^>]*>Name<\/label>\s*<input class="field" id="f-chapter-title"/) === at(/for="f-chapter-title"/),
    'CH-NAME-FIRST: the name field is directly under its label');
  assert.ok(at(/id="f-chapter-title"/) < at(/data-chbrief="1"/) && at(/data-chbrief="1"/) < at(/data-chsteer="1"/)
    && at(/data-chsteer="1"/) < at(/data-chbrief="again"/), '  then Have Anansi write these, the direction and Something else');
  assert.match(panel, /data-chbrief="again"[^>]*>↻ Something else/, '  and offers something else once the scene has its own');
  const doc = (globalThis as any).document, wasQS = doc.querySelector;
  doc.querySelector = (sel: string) => /data-chsteer/.test(sel) ? { value: 'She stays.' }
    : /data-chapter-title/.test(sel) ? { value: 'The Envoy' } : /data-chapter-opens/.test(sel) ? { value: '' }
    : /data-chapter-note/.test(sel) ? { value: 'Somewhere.' } : wasQS?.call(doc, sel) ?? null;
  click({ chbrief: 'again' });
  await sleep(60);
  doc.querySelector = wasQS;
  const ask = POSTED.filter((p: any) => p.url === '/api/chapter/propose').at(-1);
  assert.deepStrictEqual([ask?.body?.steer, ask?.body?.avoid], ['She stays.', { title: 'The Envoy', opens: '', note: 'Somewhere.' }],
    'CH-AGAIN: Something else sends the direction and what the boxes held, to be steered away from');
}
ok('This scene takes a direction and asks for something else');

// ---- STRINGS WITH NONE YET SAYS WHAT A STRING IS, and where to add one (UX review, 2026-10-29: it said
// "Nothing in play." and stopped).
{
  const was = STORY.strings;
  STORY.strings = [];
  click({ open: 's-1' }); await sleep(40);
  click({ panel: 'strings' }); await sleep(20);
  const body = html('sideBody').replace(/\s+/g, ' ');
  assert.match(body, /A string is a promise or an open question the tale carries/, 'STRINGS-EMPTY: an empty Strings says what a string is');
  assert.match(body, /＋/, '  and points at the ＋ that adds one');
  STORY.strings = was;
  click({ open: 's-1' }); await sleep(40);
}
ok('an empty Strings says what a string is and where to add one');

// ---- THE TALE'S MENU: THE MODEL ON TOP, THEN SCENES BESIDE TWO COLUMNS OF TILES (Seth, 2026-10-28).
{
  click({ open: 's-1' });
  await sleep(40);
  click({ railview: 'story' });
  const rail = html('rail');
  assert.ok(rail.indexOf('class="talemodel"') > 0 && rail.indexOf('class="talemodel"') < rail.indexOf('class="tale3"'),
    'TALE3-MODEL: the model sits above the columns');
  const tiles = rail.match(/<div class="taletiles">([\s\S]*)/)?.[1] ?? '';
  assert.deepStrictEqual([...tiles.matchAll(/data-nav="([a-z]+)"/g)].map((m) => m[1]),
    ['story', 'chapter', 'chapters', 'threads', 'strings', 'waiting'],
    'TALE3-TILES: Tale first, then This scene and Scenes, then the rest (Strings back, UX review 2026-10-29; Storyteller off, #131)');
  assert.match(tiles, /class="field railsearch" data-railsearch="1"/, 'TALE3-SEARCH: search is a bar across both columns, not a tile');
  assert.ok(tiles.indexOf('data-railsearch') > tiles.indexOf('data-nav="waiting"'), '  at the foot, below every tile');
  // EACH SCENE ROW WEARS THE TALE'S PICTURE, fainter down the list (2026-10-28), when the tale has one.
  const fades = [...rail.matchAll(/class="rowart"[^>]*opacity:([\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(fades.length >= 2 && fades.every((o, k) => k === 0 || o <= fades[k - 1]), `TALE3-ART: the scenes wear the cover, fading down (${fades})`);
  assert.doesNotMatch(rail, /<span class="serif txt"[^>]*>Anansi<\/span>/, 'TALE3-NOLOGO: no Anansi wordmark in the tale menu');
  assert.match(rail, /<div class="talemodel">[\s\S]*data-modelmenu/, 'TALE3-MODEL: the model heads the menu (its close is the ✕ where the menu covers the screen, #133)');
  assert.doesNotMatch(rail, /data-nav="(anansi|context)"/, '  and Talk to Anansi and What he reads are off the menu');
  const scenes = [...(rail.match(/<div class="tale3scenes scroll">([\s\S]*?)<div class="taletiles">/)?.[1] ?? '')
    .matchAll(/data-chapter="([^"]+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(scenes, [...STORY.chapters].reverse().map((c: any) => c.id), 'TALE3-SCENES: the scenes, newest first, in their own column');
  // THE MAIN MENU IN THE SAME SHAPE (2026-10-28): the model on top, the tales down the left, the rows as tiles.
  click({ railview: 'workspace' });
  const main = html('rail');
  assert.ok(main.indexOf('class="talemodel"') >= 0 && main.indexOf('class="talemodel"') < main.indexOf('class="tale3"'),
    'MAIN3: the main menu has the model on top too');
  const tales = [...(main.match(/<div class="tale3scenes scroll">([\s\S]*?)<div class="taletiles">/)?.[1] ?? '').matchAll(/data-open="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(tales.length > 0 && tales.includes('s-1'), `MAIN3-TALES: the tales are listed down the left (${tales})`);
  assert.match(main.match(/<div class="taletiles">([\s\S]*)/)?.[1] ?? '', /data-nav="stories"[\s\S]*data-nav="account"/, '  and the menu rows are the tiles');
  assert.doesNotMatch(main, /<span class="serif txt"[^>]*>Anansi<\/span>/, '  with no wordmark');
}
ok("both menus: the model on top, a list down the left (scenes, or tales), and two columns of tiles");

// ---- THE TWO MENUS TALK TO EACH OTHER (Seth, 2026-10-30: "make the main menu and tale menu talk to
// each other so you can reach either from an icon in it"). One ink icon at the top of each swaps to
// the other in place: the page under the menu stays what it was until something in it is pressed.
{
  const root = (globalThis as any).document.documentElement;
  const swap = (h: string) => h.match(/<button class="railswap"[\s\S]*?<\/button>/)?.[0] ?? '';
  const { mark } = await import('../web/model.js');
  const pic = (h: string) => (h.match(/<svg[\s\S]*?<\/svg>/)?.[0] ?? '').replace(/\s+/g, ' ');
  click({ open: 's-1' }); await sleep(40);
  click({ railview: 'story' });
  if (root.dataset.uiRail !== 'open') click({ railview: 'story' });
  const toMain = swap(html('rail'));
  assert.match(toMain, /data-railview="workspace"/, 'SWAP-TALE: the tale menu has an icon that asks for the main menu');
  assert.match(toMain, /aria-label="The main menu" title="The main menu"/, '  and says so, out loud and on hover');
  assert.strictEqual(pic(toMain), mark('menu').replace(/\s+/g, ' '), "  wearing the menu's mark");
  assert.doesNotMatch(toMain, /gold/, '  in ink, not gold (ADR 0004)');
  // ON THE LEFT, so the model sits in the middle with the ✕ on the right (Seth, 2026-10-30).
  {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
    const rule = css.match(/\.railswap \{[^}]*\}/)?.[0] ?? '';
    assert.match(rule, /\bleft:/, 'SWAP-LEFT: the icon sits on the left of the menu head');
    assert.doesNotMatch(rule, /\bright:/, '  not beside the close');
    assert.match(css, /\.talemodel > button\[data-modelmenu\] \{[^}]*justify-content:center/, 'MODEL-CENTRE: and the model between them, centred');
  }
  click({ railview: 'workspace' }); await sleep(20);
  assert.match(html('rail'), /data-nav="stories"/, 'SWAP-TALE: pressing it shows the main menu');
  assert.strictEqual(root.dataset.uiRail, 'open', '  with the menu still open');
  assert.match(html('bar'), /data-home="1"/, '  and the tale still on the page under it');
  const toTale = swap(html('rail'));
  assert.match(toTale, /data-railview="story"/, 'SWAP-MAIN: the main menu has an icon that asks for the tale menu');
  assert.match(toTale, /aria-label="The tale's menu" title="The tale's menu"/, '  and says so');
  assert.strictEqual(pic(toTale), mark('webfull').replace(/\s+/g, ' '), "  wearing the tale menu's mark, the one on its header button");
  click({ railview: 'story' }); await sleep(20);
  assert.match(html('rail'), /data-nav="chapter"/, 'SWAP-MAIN: pressing it shows the tale menu again');
  // FROM THE LIBRARY, THE TALE LAST OPEN. The header's ‹ leaves the tale and forgets it as the open
  // one; the main menu still knows which tale was last open, and its menu comes up over the Library.
  // The tale's menu was the one showing when ‹ was pressed, and the desk's rail stays open: what it
  // shows now is the main menu, so its icon must swap, not read as "that menu again" and shut it.
  click({ home: 1 }); await sleep(40);
  assert.strictEqual(root.dataset.uiRail, 'open', 'SWAP-LAST: the desk rail is still open on the Library');
  assert.doesNotMatch(html('bar'), /data-home="1"/, 'SWAP-LAST: on the Library now');
  assert.match(html('rail'), /data-nav="stories"/, '  showing the main menu');
  assert.match(swap(html('rail')), /data-railview="story"/, "SWAP-LAST: the main menu still offers the last tale's menu");
  click({ railview: 'story' }); await sleep(40);
  assert.strictEqual(root.dataset.uiRail, 'open', 'SWAP-LAST: pressing it swaps the menu, and does not shut it');
  assert.match(html('rail'), /data-chapter="c-/, "SWAP-LAST: pressing it shows that tale's menu, its scenes and all");
  assert.doesNotMatch(html('bar'), /data-home="1"/, '  over the Library, which has not moved');
  click({ nav: 'threads' }); await sleep(60);
  assert.match(html('bar'), /data-home="1"/, 'SWAP-LAST: a tile in it then opens the tale');
  assert.match(html('sideHead') + html('sideBody'), /[Tt]hreads/, '  on the page the tile names');
}
ok("each menu has an ink icon that swaps to the other in place, and from the Library it is the last tale's");

// ---- THE TWO MENUS' ITEMS ARE ONE SIZE (Seth, 2026-10-30: "make sure that the sizes of all its items
// match"). The tiles of both menus wear one class and the list rows (scenes, tales) another, and their
// sizes live in those classes, so neither menu can grow a size of its own.
{
  const classesIn = (h: string, box: RegExp) => [...(h.match(box)?.[1] ?? '').matchAll(/<button ([^>]*)>/g)]
    .map((m) => m[1].match(/class="([^"]*)"/)?.[1] ?? '(none)');
  const tilesIn = /<div class="taletiles">([\s\S]*?)<\/div>/;
  const rowsIn = /<div class="tale3scenes scroll">([\s\S]*?)<div class="tale(?:side|tiles)">/;
  click({ open: 's-1' }); await sleep(40);
  click({ railview: 'story' }); await sleep(20);
  const tale = html('rail');
  click({ railview: 'workspace' }); await sleep(20);
  const main = html('rail');
  const tTiles = classesIn(tale, tilesIn), mTiles = classesIn(main, tilesIn);
  assert.ok(tTiles.length >= 6 && mTiles.length >= 6, `SAME-TILES: both menus' tiles are read (${tTiles.length}, ${mTiles.length})`);
  assert.deepStrictEqual([...new Set([...tTiles, ...mTiles])], ['railtile'], 'SAME-TILES: every tile in both menus is a railtile');
  const tRows = classesIn(tale, rowsIn), mRows = classesIn(main, rowsIn);
  assert.ok(tRows.length >= 2 && mRows.length >= 1, `SAME-ROWS: both menus' rows are read (${tRows.length}, ${mRows.length})`);
  assert.deepStrictEqual([...new Set([...tRows, ...mRows].map((c) => c.replace(/\s*arted\s*/, '')))], ['railrow'],
    'SAME-ROWS: every scene row and every tale row is a railrow');
  // The sizes are the classes', not each item's own: no padding or font size written on one.
  for (const [h, name] of [[tale, 'tale'], [main, 'main']] as const)
    assert.doesNotMatch(h.match(/<div class="tale3">[\s\S]*/)?.[0] ?? '', /<button class="rail(?:tile|row)[^"]*"[^>]*style="[^"]*(?:padding|font-size)/,
      `SAME-SIZE: no tile or row in the ${name} menu sets its own padding or font size`);
}
ok("both menus' tiles share one class and their rows another, with the sizes in the classes");

// ---- A SCENE PRESSED IN THE TALE'S MENU OPENS IT AND PUTS THE MENU AWAY (Seth, 2026-10-30: "hitting
// a chapter in tale menu should just open the chapter and hide the menu"), where the menu covers the
// page. At a desk the rail sits beside the page and stays.
{
  const root = (globalThis as any).document.documentElement;
  const wide = (globalThis as any).matchMedia;
  click({ open: 's-1' }); await sleep(40);
  (globalThis as any).matchMedia = () => ({ matches: true, addEventListener() {} });   // phone width
  try {
    click({ railview: 'story' });
    if (root.dataset.uiRail !== 'open') click({ railview: 'story' });
    assert.strictEqual(root.dataset.uiRail, 'open', 'SCENE-SHUTS: the menu is open before the scene is pressed');
    click({ chapter: STORY.chapters[0].id }); await sleep(40);
    assert.strictEqual(root.dataset.uiRail, 'closed', 'SCENE-SHUTS: on a phone a scene pressed in the menu shuts it');
  } finally { (globalThis as any).matchMedia = wide; }
  click({ railview: 'story' });
  if (root.dataset.uiRail !== 'open') click({ railview: 'story' });
  click({ chapter: STORY.chapters[0].id }); await sleep(40);
  assert.strictEqual(root.dataset.uiRail, 'open', 'SCENE-SHUTS: at a desk the rail stays beside the page');
}
ok('a scene pressed in the tale menu opens it and shuts the menu where the menu covers the page');

// ---- EVERY ROW ITS OWN PICTURE, AND A CLOSE YOU CAN SEE (UX review, 2026-10-29). The main menu drew
// the open book for What changed and for Demo library, and the plain circle for Tale and for Report
// an issue (it named a mark, `bug`, that did not exist, and `mark` falls back to the circle). On a
// phone the menu is the whole screen, and its only way out was a chevron that read as the model's.
{
  const rows = (h: string) => [...h.matchAll(/<button class="railtile" (data-nav|data-demo)="([^"]*)"[\s\S]*?(<svg[\s\S]*?<\/svg>)/g)]
    .map((m) => ({ key: m[1] === 'data-demo' ? 'demo' : m[2], pic: m[3].replace(/\s+/g, ' ') }));
  const { mark } = await import('../web/model.js');
  const circle = mark('story').replace(/\s+/g, ' ');
  for (const view of ['workspace', 'story']) {
    click({ railview: view });
    const r = rows(html('rail'));
    assert.ok(r.length >= 6, `MENU-ICONS: the ${view} menu's rows are read (${r.length})`);
    assert.strictEqual(new Set(r.map((x) => x.pic)).size, r.length, `MENU-ICONS: no two rows of the ${view} menu share a picture`);
    // The plain circle is Tale's, and what `mark` draws for a name it does not know.
    assert.deepStrictEqual(r.filter((x) => x.pic === circle && x.key !== 'story').map((x) => x.key), [],
      `MENU-ICONS: no row of the ${view} menu wears the circle but Tale`);
  }
  const wide = (globalThis as any).matchMedia;
  (globalThis as any).matchMedia = () => ({ matches: true, addEventListener() {} });   // phone width
  try {
    const rootNow = (globalThis as any).document.documentElement;
    click({ railview: 'workspace' });
    if (rootNow.dataset.uiRail !== 'open') click({ railview: 'workspace' });
    assert.strictEqual(rootNow.dataset.uiRail, 'open', 'MENU-CLOSE: the menu is open before its close is read');
    const close = html('rail').match(/<button data-rail="1" class="railclose"[\s\S]*?<\/button>/)?.[0] ?? '';
    assert.match(close, /aria-label="Close the menu"/, 'MENU-CLOSE: the close says what it does');
    assert.match(close, /\u2715/, 'MENU-CLOSE: and on a phone it is a cross, not the chevron');
    click({ rail: '1' });
    assert.strictEqual(rootNow.dataset.uiRail, 'closed', 'MENU-CLOSE: and it closes the menu');
  } finally { (globalThis as any).matchMedia = wide; }
}
ok('every menu row has its own picture, and the phone menu has a cross to close it');

// ---- THE ACCOUNT, FOUR PAGES (Seth, 2026-10-27): you, your key and model, the look, your books;
// Import, Export and What you have written left the menu for it. Your writing was a fifth until #131
// moved it to Storyteller → Your voice.
{
  click({ railview: 'workspace' }); click({ nav: 'account' });
  for (let i = 0; i < 40 && !/f-me-name/.test(html('page')); i++) await sleep(25);
  const tabsOf = (h: string) => [...h.matchAll(/data-accttab="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(tabsOf(html('page')), ['profile', 'model', 'look', 'books'], 'four pages, not one');
  assert.match(html('page'), /id="f-me-name" value="Seth"/, 'You: your name');
  assert.match(html('page'), /data-avatar="1"/, 'and a picture to choose');
  // YOUR NAME SAVES WHEN YOU LEAVE THE BOX (ADR 0004, pass three): no Save beside it.
  assert.doesNotMatch(html('page'), /data-savename/, 'NAME-NOSAVE: no Save beside your name');
  POSTED.length = 0;
  (listeners.change ?? []).forEach((f: Function) => f({ target: { id: 'f-me-name', value: 'Seth H', dataset: {} } }));
  await sleep(30);
  assert.strictEqual(POSTED.find((p: any) => p.url === '/api/me')?.body.name, 'Seth H', 'NAME-SAVES: leaving the box saves your name');
  assert.doesNotMatch(html('rail'), /data-nav="(import|prefs|forge)"/, 'Import, Export and What you have written are off the menu');
  assert.match(html('rail'), /data-nav="account"/, 'and Account is on it');
  click({ accttab: 'model' });
  assert.match(html('page'), /No key yet, so you write on the local model/, 'Model: no key means the local model');
  assert.match(html('page'), /featherless-sonophage\.key/, 'and says which file the key goes in');
  click({ accttab: 'books' });
  for (const k of ['import', 'forge', 'prefs'])
    assert.match(html('page'), new RegExp(`data-nav="${k}"`), `Your books opens ${k}`);
  click({ accttab: 'profile' });
}
ok('Account is four pages, and Your books holds Import, Export and What you have written');

// ---- #131 · STORYTELLER IS ONE PANEL WITH FOUR TABS (Seth, 2026-11-03): Model, Shortlist, Your
// voice and Stats. The model name in either menu is its door; the tale's menu has no Storyteller row;
// Account loses Writing; the old model, find-a-model and Account → Writing doors land on the tab
// that holds what they opened.
{
  const side = () => (globalThis as any).document.getElementById('side');
  const tabsOf = (h: string) => [...h.matchAll(/data-tellertab="([a-z]+)"/g)].map((m) => m[1]);
  const shown = () => html('sideBody').match(/data-tellertab="([a-z]+)" aria-pressed="true"/)?.[1] ?? null;
  click({ open: 's-1' });
  await sleep(40);
  click({ railview: 'story' });
  const tiles = html('rail').match(/<div class="taletiles">([\s\S]*)/)?.[1] ?? '';
  assert.ok(tiles.includes('data-nav="story"'), 'the detector: the tale menu tiles are drawn');
  assert.doesNotMatch(tiles, /data-nav="teller"/, 'TELLER-OFF-MENU: the tale menu has no Storyteller row');

  click({ modelmenu: '1' });
  await sleep(30);
  assert.strictEqual(side().hidden, false, 'TELLER-DOOR: the model name opens a panel');
  assert.match(html('sideHead'), /Storyteller/, 'TELLER-DOOR: and it is Storyteller');
  assert.strictEqual(shown(), 'model', 'TELLER-DOOR: on Model');
  assert.doesNotMatch(html('rail'), /data-findmodel=/, 'TELLER-DOOR: the menu no longer drops a list open');
  assert.deepStrictEqual(tabsOf(html('sideBody')), ['model', 'shortlist', 'addmodel', 'voice', 'stats'],
    'TELLER-TABS: Model, Shortlist, Add a model, Your voice and Stats in a tale');
  const model = html('sideBody').replace(/<!--[\s\S]*?-->/g, '');
  const at = (re: RegExp) => model.search(re);
  // Seth, 2026-11-03: "this should be tale dependent". Two headed sections, the tale's first.
  assert.ok(at(/>This tale</) !== -1 && at(/>This tale</) < at(/data-tellerlist="tale"/)
    && at(/data-tellerlist="tale"/) < at(/data-story="weaving"/) && at(/data-story="weaving"/) < at(/data-story="maxContext"/),
    'TELLER-SECTIONS: "This tale" holds the model that writes it, Plans first and how much he reads');
  assert.ok(at(/data-story="maxContext"/) < at(/>On every tale</) && at(/>On every tale</) < at(/data-tellerlist="usual"/)
    && at(/data-tellerlist="usual"/) < at(/data-gen="temperature"/) && at(/data-gen="temperature"/) < at(/data-gen="target_words"/),
    'TELLER-SECTIONS: and "On every tale" holds your usual model, how he picks words and the longest a passage runs');
  // Seth: "remove the drop down and instead do the panel to open on toggle."
  assert.doesNotMatch(model, /data-storymodel=/, 'TELLER-NOSELECT: no drop-down to choose the tale\'s model');
  assert.doesNotMatch(model, /<select[^>]*aria-label="[^"]*model/i, 'TELLER-NOSELECT: and no drop-down for any model');
  assert.match(model, /<button data-tellerlist="tale" aria-expanded="false"/, 'TELLER-TOGGLE: the tale\'s model is one row, shut');
  assert.match(model, /<button data-tellerlist="usual" aria-expanded="false"/, 'TELLER-TOGGLE: and so is your usual model');
  assert.doesNotMatch(model, /data-talemodel=|data-pickmodel=/, 'TELLER-TOGGLE: no list until a row is pressed');
  // Seth: "a plus to add a new model".
  assert.match(model.slice(at(/data-tellerlist="usual"/), at(/data-gen="temperature"/)), /data-findmodel="1"[^>]*>＋</,
    'TELLER-PLUS: a ＋ beside the model row opens Add a model');
  click({ findmodel: '1' });
  assert.strictEqual(shown(), 'addmodel', 'TELLER-PLUS: and the ＋ lands on Add a model');
  click({ tellertab: 'model' });

  // ONE PRESS OPENS THE LIST, A PICK CLOSES IT, and each model is in it once (Seth: "your model is
  // on there twice"). The writer's usual model here is one the list also holds, which is the case
  // that showed it twice: once as "Your model" and once by its own name.
  const wasDefault = (STORY as any).defaultModel;
  (STORY as any).defaultModel = 'Qwen3.6-WNTH-35B-A3B-NN';
  click({ open: 's-1' });
  await sleep(40);
  click({ modelmenu: '1' });
  await sleep(30);
  click({ tellerlist: 'tale' });
  const taleOpen = html('sideBody');
  assert.match(taleOpen, /<button data-tellerlist="tale" aria-expanded="true"/, 'TELLER-TOGGLE: a press opens the tale\'s list');
  const picks = [...taleOpen.matchAll(/data-talemodel="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(picks.length >= 3, `the detector: the tale's list is drawn (${picks.join(', ')})`);
  assert.ok(!picks.includes('Qwen3.6-WNTH-35B-A3B-NN'),
    'TELLER-ONCE: the tale follows your model, so the row names it and the list does not again');
  assert.strictEqual(new Set(picks).size, picks.length, 'TELLER-ONCE: no model twice');
  assert.doesNotMatch(taleOpen, /data-pickmodel=/, 'TELLER-TOGGLE: only the pressed row\'s list opens');
  const before = POSTED.length;
  click({ talemodel: 'Wayfarer-2-RPNT-12B' });
  await sleep(40);
  assert.ok(POSTED.slice(before).some((p: any) => p.url === '/api/story' && p.body.story?.model === 'Wayfarer-2-RPNT-12B'),
    'TELLER-PICK: a pick saves the tale\'s model');
  assert.doesNotMatch(html('sideBody'), /data-talemodel=/, 'TELLER-PICK: and closes the list');
  click({ tellerlist: 'usual' });
  const usualOpen = html('sideBody');
  const mine = [...usualOpen.matchAll(/data-pickmodel="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(mine.length >= 2, `the detector: your list is drawn (${mine.join(', ')})`);
  assert.ok(!mine.includes('Qwen3.6-WNTH-35B-A3B-NN'), 'TELLER-ONCE: the model in force is the row, not in the list again');
  assert.strictEqual(new Set(mine).size, mine.length, 'TELLER-ONCE: no model twice in your list');
  click({ tellerlist: 'usual' });
  assert.doesNotMatch(html('sideBody'), /data-pickmodel=/, 'TELLER-TOGGLE: a second press shuts it');
  // A tale with a model of its own: "Your model" is in its list, once, and never by its own name.
  const wasPin = { model: STORY.model, story: (STORY.story as any).model };
  STORY.model = 'Wayfarer-2-RPNT-12B'; (STORY.story as any).model = 'Wayfarer-2-RPNT-12B';
  click({ open: 's-1' });
  await sleep(40);
  click({ modelmenu: '1' });
  await sleep(30);
  click({ tellerlist: 'tale' });
  const pinned = [...html('sideBody').matchAll(/data-talemodel="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(pinned.includes(''), `TELLER-ONCE: a tale with its own model offers "Your model" (${pinned.join(', ')})`);
  assert.ok(!pinned.includes('Qwen3.6-WNTH-35B-A3B-NN'), 'TELLER-ONCE: and not your model again by its own name');
  assert.ok(!pinned.includes('Wayfarer-2-RPNT-12B'), 'TELLER-ONCE: nor the tale\'s own, which is the row');
  click({ tellerlist: 'tale' });
  STORY.model = wasPin.model; (STORY.story as any).model = wasPin.story;
  (STORY as any).defaultModel = wasDefault;
  click({ open: 's-1' });
  await sleep(40);
  click({ modelmenu: '1' });
  await sleep(30);

  // WHAT IT IS, under the row it is about.
  click({ modelinfo: 'write-nt-qwen36-h' });
  const info = html('sideBody');
  const row = info.indexOf('data-tellerlist="usual"');
  assert.ok(row > 0 && info.indexOf('How fast he writes', row) > row && info.indexOf('How fast he writes', row) < info.indexOf('data-gen="temperature"'),
    'TELLER-INFO: the model info is drawn under the model row it is about');

  click({ tellertab: 'stats' });
  assert.strictEqual(shown(), 'stats', 'TELLER-STATS: the Stats tab');
  assert.match(html('sideBody'), /This tale's calls/, 'TELLER-STATS: holds this tale\'s calls');
  assert.doesNotMatch(html('sideBody'), /data-gen=/, 'TELLER-STATS: and not the sliders');
  click({ tellertab: 'voice' });
  for (let i = 0; i < 40 && !/data-mydefaultvoice/.test(html('sideBody')); i++) await sleep(25);
  assert.match(html('sideBody'), /data-mydefaultvoice/, 'TELLER-VOICE: Your voice holds the writer\'s voice');
  assert.match(html('sideBody'), /data-anansivoice/, 'TELLER-VOICE: how Anansi talks');
  assert.match(html('sideBody'), /data-editprompt="continue"/, 'TELLER-VOICE: and the five modes');
  assert.doesNotMatch(html('sideBody'), /data-acctgo=/, 'TELLER-VOICE: and no door to Account any more');
  click({ tellertab: 'shortlist' });
  assert.match(html('sideBody'), /id="findmine"/, 'TELLER-SHORTLIST: the shortlist');
  assert.doesNotMatch(html('sideBody'), /id="findq"|needs a Featherless key/, 'TELLER-SHORTLIST: and no search on it');
  click({ tellertab: 'addmodel' });
  assert.match(html('sideBody'), /needs a Featherless key/, 'TELLER-NOKEY: with no key, Add a model says it needs one');
  assert.doesNotMatch(html('sideBody'), /id="findq"/, 'TELLER-NOKEY: and offers no box that cannot search');
  assert.doesNotMatch(html('sideBody'), /id="findmine"/, 'TELLER-ADD: the shortlist is its own tab');
  modelsRemote = true;
  click({ dropshort: 'featherless:Other/Unused-12B' });   // the list read again, so the key is known
  await sleep(40);
  click({ tellertab: 'addmodel' });
  await sleep(30);
  assert.match(html('sideBody'), /id="findq"[\s\S]*id="findhits"/,
    'TELLER-ADD: with a key, Add a model is the Featherless search');
  modelsRemote = false;
  click({ dropshort: 'featherless:Other/Unused-12B' });
  await sleep(40);

  // THE OLD DOORS. Presses first, then the addresses a bookmark carries.
  click({ tellertab: 'model' });
  click({ findmodel: '1' });
  await sleep(30);
  assert.strictEqual(shown(), 'addmodel', 'TELLER-WAS: Find a model opens Storyteller on Add a model');
  click({ modelinfo: 'write-nt-qwen36-h' });
  assert.strictEqual(shown(), 'model', 'TELLER-WAS: a model\'s info opens it on Model');
  click({ acctgo: 'writing' });
  await sleep(30);
  assert.strictEqual(shown(), 'voice', 'TELLER-WAS: Account → Writing opens it on Your voice');
  assert.strictEqual(side().hidden, false, '  and it is open');
  const go = async (hash: string) => {
    (globalThis as any).location.hash = hash;
    await Promise.all((winListeners.hashchange ?? []).map((f) => f({ oldURL: 'https://x/#s-1' })));
    await sleep(40);
  };
  await go('#s-1/findmodel');
  assert.strictEqual(shown(), 'addmodel', 'TELLER-WAS: a findmodel address lands on Add a model');
  await go('#s-1/model');
  assert.strictEqual(shown(), 'model', 'TELLER-WAS: a model address lands on Model');
  (globalThis as any).location.hash = '';

  // OUTSIDE A TALE: Model with the usual model only, Shortlist and Your voice.
  click({ home: 1 });
  await sleep(40);
  click({ modelmenu: '1' });
  await sleep(30);
  assert.strictEqual(side().hidden, false, 'TELLER-LIB: Storyteller opens in the library');
  assert.deepStrictEqual(tabsOf(html('sideBody')), ['model', 'shortlist', 'addmodel', 'voice'],
    'TELLER-LIB: Model, Shortlist, Add a model and Your voice, and no Stats');
  assert.match(html('sideBody'), />On every tale<[\s\S]*<button data-tellerlist="usual"/, 'TELLER-LIB: the usual model, on every tale');
  assert.doesNotMatch(html('sideBody'), />This tale</, 'TELLER-LIB: no "This tale" with no tale');
  assert.doesNotMatch(html('sideBody'), /data-storymodel=|data-tellerlist="tale"|data-story="|data-gen=/,
    'TELLER-LIB: and no per-tale controls, and no sliders');
  click({ tellertab: 'stats' });
  assert.notStrictEqual(shown(), 'stats', 'TELLER-LIB: Stats cannot be shown with no tale');
  click({ acctgo: 'writing' });
  await sleep(30);
  assert.strictEqual(shown(), 'voice', 'TELLER-LIB: Account → Writing opens Your voice here too');
  click({ tellertab: 'model' }); click({ panel: '' });   // as the checks after this one expect it

  // ACCOUNT KEEPS THE KEY AND SAYS WHERE THE MODEL IS CHANGED.
  click({ railview: 'workspace' }); click({ nav: 'account' });
  for (let i = 0; i < 40 && !/data-accttab/.test(html('page')); i++) await sleep(25);
  assert.deepStrictEqual([...html('page').matchAll(/data-accttab="([a-z]+)"/g)].map((m) => m[1]),
    ['profile', 'model', 'look', 'books'], 'ACCT-NOWRITING: Account has no Writing tab');
  click({ accttab: 'model' });
  assert.match(html('page'), /No key yet/, 'ACCT-MODEL: the Model tab keeps the Featherless key');
  assert.match(html('page'), /Storyteller/, 'ACCT-MODEL: and names Storyteller as where the model is changed');
  assert.doesNotMatch(html('page'), /pick from its list/, 'ACCT-MODEL: not a list that is gone');
  click({ accttab: 'profile' });
}
ok('Storyteller is one panel with Model, Shortlist, Your voice and Stats, and the old doors land on its tabs');

// ---- THE DEMO LIBRARY LEAVES THE MENU FOR ACCOUNT → YOUR BOOKS (#133, Seth, 2026-11-03). It is a
// rare thing to do, so it is a plate beside Import and Export; while it is on, the library page says
// how to leave, since the menu no longer does.
{
  click({ home: 1 }); await sleep(40);
  click({ railview: 'workspace' });
  assert.doesNotMatch(html('rail'), /data-demo=/, 'DEMO-OFFMENU: the main menu has no demo library tile');
  click({ nav: 'account' }); click({ accttab: 'books' });
  const books = html('page');
  assert.match(books, /<button class="card plate full-left" data-demo="1"[^>]*>[\s\S]*?Demo library/,
    'DEMO-ACCOUNT: Your books has the demo library, a plate like Import and Export');
  assert.doesNotMatch(html('page'), /data-demo="0"/, '  and with it off, nothing offers to leave it');
  click({ demo: '1' });
  for (let i = 0; i < 40 && !libDemo; i++) await sleep(25);
  await sleep(60);
  assert.strictEqual(libDemo, true, 'DEMO-ON: the plate switches the demo library on');
  assert.match(html('page'), /data-demo="0"[^>]*>[\s\S]*?Leave the demo library/,
    'DEMO-LEAVE: in the demo library, the library page says how to leave it');
  assert.doesNotMatch(html('rail'), /data-demo=/, '  and the menu still has no tile for it');
  click({ demo: '0' });
  for (let i = 0; i < 40 && libDemo; i++) await sleep(25);
  await sleep(60);
  assert.strictEqual(libDemo, false, 'DEMO-OFF: the leave line switches it off');
  assert.doesNotMatch(html('page'), /Leave the demo library/, '  and once out, the line is gone');
}
ok('the demo library is a plate in Account → Your books, and the library says how to leave it');

// ---- ONE CONTROL OPENS AND SHUTS THE MENU ON A DESK (#133): the header's menu icon. The menu's own
// chevron did the same, so it went. Where the menu covers the screen its ✕ stays, the only way out.
{
  const root = (globalThis as any).document.documentElement;
  for (const view of ['workspace', 'story']) {
    if (view === 'story') { click({ open: 's-1' }); await sleep(40); }
    click({ railview: view });
    if (root.dataset.uiRail !== 'open') click({ railview: view });
    assert.doesNotMatch(html('rail'), /class="railclose"/, `DESK-NOCLOSE: at a desk the ${view} menu has no close of its own`);
  }
  const wide = (globalThis as any).matchMedia;
  (globalThis as any).matchMedia = () => ({ matches: true, addEventListener() {} });   // phone width
  try {
    for (const view of ['workspace', 'story']) {
      click({ railview: view });
      if (root.dataset.uiRail !== 'open') click({ railview: view });
      const close = html('rail').match(/<button data-rail="1" class="railclose"[\s\S]*?<\/button>/)?.[0] ?? '';
      assert.match(close, /\u2715/, `PHONE-CLOSE: where the ${view} menu covers the screen, it has its ✕`);
    }
  } finally { (globalThis as any).matchMedia = wide; }
}
ok('at a desk the header icon is the one menu control; a full-screen menu keeps its ✕');

// ---- ONE PRESS CLOSES (Seth, 2026-11-03: "yes a one press close"). In a tale at a desk, with the main
// menu showing (swapped to from the tale's), the header's menu control shuts it. It swapped to the
// tale's menu first, and a second press shut it. The swap stays the menu's own icon.
{
  const root = (globalThis as any).document.documentElement;
  click({ open: 's-1' }); await sleep(40);
  if (root.dataset.uiRail === 'open') click({ railview: 'story', railhead: '1' });
  assert.notStrictEqual(root.dataset.uiRail, 'open', 'the detector: the menu starts shut');
  assert.match(html('bar'), /<button data-railview="story" data-railhead="1"/, 'the detector: the header carries its menu control');
  click({ railview: 'story', railhead: '1' }); await sleep(20);
  assert.strictEqual(root.dataset.uiRail, 'open', 'HEAD-OPENS: the header opens the tale\'s menu');
  click({ railview: 'workspace' }); await sleep(20);
  assert.match(html('rail'), /class="railswap" data-railview="story"/, 'the detector: the main menu is showing, with its icon to the tale\'s');
  click({ railview: 'story', railhead: '1' }); await sleep(20);
  assert.notStrictEqual(root.dataset.uiRail, 'open', 'HEAD-ONE-CLOSE: one press of the header shuts the main menu');
  click({ railview: 'story', railhead: '1' }); await sleep(20);
  click({ railview: 'workspace' }); await sleep(20);
  click({ railview: 'story' }); await sleep(20);
  assert.strictEqual(root.dataset.uiRail, 'open', 'SWAP-KEPT: the menu\'s own icon still swaps to the tale\'s menu');
  assert.doesNotMatch(html('rail'), /class="railswap" data-railview="story"/, '  and the tale\'s menu is the one showing');
  click({ railview: 'story', railhead: '1' }); await sleep(20);
}
ok('in a tale at a desk, one press of the header shuts the main menu, and the swap is the menu\'s icon');

// ---- THREE COLUMNS OF THREADS WHERE THE PANEL IS WIDE (#133). Measured on the PANEL's width, not the
// window's, so a 400px panel on a wide desk stays one column; the cards keep their 260px. The browser
// measures it (test/ui/threadlist.js); this pins the rules it measures.
{
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
  assert.match(css, /#thlist \{[^}]*container-type:\s*inline-size/, 'THREE-COLS: the tale\'s Threads list is a container');
  const q = css.match(/@container \(min-width:\s*(\d+)px\) \{([\s\S]*?)\n\}/);
  assert.ok(q, 'THREE-COLS: a container query on it');
  assert.match(q![2], /#thlist \[data-kindrows\] \{[^}]*grid-template-columns:\s*repeat\(3,/, '  that lays each kind out in three columns');
  assert.ok(Number(q![1]) > 400 - 44 && Number(q![1]) <= 620 - 44,
    `  wider than the panel beside the page, narrower than the smallest full-screen panel (${q![1]})`);
}
ok("the tale's threads go to three columns when their panel is wide");

// ---- WHEN YOU REWEAVE (Seth, 2026-10-29: "under your account and writing I can't see reweave").
// Storyteller → Your voice (Account → Writing until #131) draws a sixth box after the five modes, and it saves and resets through the
// same prompt route under the key `reweave`. Since the last 2026-10-29 change (docs/adr/0012) the box
// frames the What didn't work note and nothing else: the take is no longer sent, so the box has one
// placeholder, {{whatfailed}}, and the tip names only that one.
{
  const doc = (globalThis as any).document;
  click({ modelmenu: '1' }); click({ tellertab: 'voice' });
  for (let i = 0; i < 40 && !/data-editprompt=/.test(html('sideBody')); i++) await sleep(25);
  const page = html('sideBody');
  assert.doesNotMatch(page, /The five modes and Reweave/, 'the heading no longer names a Reweave box it did not have');
  assert.match(page, /The five modes, in your words/, 'it names the five modes');
  assert.deepStrictEqual([...page.matchAll(/data-editprompt="([a-z]+)"/g)].map((m) => m[1]),
    ['continue', 'speak', 'act', 'direct', 'narrate', 'reweave'], 'the five modes, then the reweave box');
  assert.match(page, /When you reweave/, 'the sixth box is named for what it is');
  // The prompts load must carry Anansi's own voice too, or its box sat on "Reading it…".
  assert.match(page, /data-anansivoice/, 'ANANSI-VOICE: How Anansi talks is drawn once the prompts load');

  click({ editprompt: 'reweave' });
  const open = html('sideBody');
  // SAVED AS YOU TYPE (ADR 0004, pass three): no Save, and Undo my changes in its place.
  assert.doesNotMatch(open, /data-saveprompt|>Save</, 'PROMPT-NO-SAVE: opened, there is no Save');
  assert.match(open, /data-undoprompt="reweave"[^>]*>Undo my changes</, 'PROMPT-UNDO-SHOWN: Undo my changes in its place');
  assert.match(open, /data-resetprompt="reweave"/, 'and reset');
  assert.match(open, /<textarea[^>]*data-prompttext[^>]*>\[A note from the writer on what did not work in the last version of this passage\. That version is not shown\. Avoid what the note describes: \{\{whatfailed\}\}\]<\/textarea>/,
    'opened, the box is filled with the shipped note frame, its one placeholder in');
  assert.doesNotMatch(open, /Added after the passage's own|Empty, nothing\s+is added/i,
    'and no longer calls itself a line added after the instruction');
  assert.doesNotMatch(open, /\{\{replaced\}\}|Save refuses/, 'the tip no longer names {{replaced}}, or a refusal for it');
  assert.match(open, /<code>\{\{whatfailed\}\}<\/code> is what you write in What didn't\s+work/,
    'the tip says what {{whatfailed}} is');
  assert.match(open, /not sent/, 'and that the version being replaced is not sent');
  assert.match(open, /leave What didn't work empty, nothing from this box is sent/,
    'and that an empty note sends nothing from this box');
  assert.doesNotMatch(open, /how to treat the version being replaced/, 'the five-modes tip no longer says the version is treated');

  const box: any = { value: 'Take the other road. {{whatfailed}}' };
  const wasQS = doc.querySelector;
  doc.querySelector = (sel: string) => (sel === '[data-prompttext]' ? box : null);
  const prompts = () => POSTED.filter((x) => String(x.url) === '/api/prompts').map((x) => x.body);
  const typePrompt = (value: string) => { box.value = value; (listeners.input ?? []).forEach((f: Function) =>
    f({ target: { ...box, id: '', dataset: { prompttext: '' }, matches: (q: string) => q === '[data-prompttext]', closest: () => null } })); };
  try {
    POSTED.length = 0;
    typePrompt('Take the other road. {{whatfailed}}');
    await sleep(400);
    assert.deepStrictEqual(prompts(), [], 'PROMPT-PAUSE: nothing is written while the typing goes on');
    await sleep(700);
    assert.deepStrictEqual(prompts(), [{ key: 'reweave', text: 'Take the other road. {{whatfailed}}' }],
      'PROMPT-AUTOSAVE: the pause writes what is in the box, as reweave');
    // Saving a box must not blank the rest of the page: the voice editor above it stays drawn.
    assert.match(html('sideBody'), /data-mydefaultvoice/, 'and the voice box above it is still there after it saves');
    // SHUT INSIDE THE PAUSE, the last of the typing is written as it shuts.
    typePrompt('Take the other road at once. {{whatfailed}}');
    click({ editprompt: 'reweave' }); await sleep(30);
    assert.deepStrictEqual(prompts().at(-1), { key: 'reweave', text: 'Take the other road at once. {{whatfailed}}' },
      'PROMPT-SHUT-FLUSH: shutting the box writes what the pause had not');
    await sleep(1000);
    assert.strictEqual(prompts().length, 2, '  once');
    // UNDO MY CHANGES: it opened on Anansi's own, so putting it back is the reset. Two presses.
    click({ editprompt: 'reweave' });
    POSTED.length = 0;
    typePrompt('Something else. {{whatfailed}}');
    await sleep(1000);
    click({ undoprompt: 'reweave' }); await sleep(30);
    assert.strictEqual(prompts().length, 1, 'PROMPT-UNDO-ASKS: the first press of Undo my changes asks');
    click({ undoprompt: 'reweave' }); await sleep(30);
    assert.deepStrictEqual(prompts().map((b: any) => b.text), ['Something else. {{whatfailed}}', ''],
      'PROMPT-UNDO: the second puts back what it opened on, here Anansi\'s own');
    POSTED.length = 0;
    click({ resetprompt: 'reweave' });
    await sleep(30);
    assert.deepStrictEqual(POSTED.filter((x) => String(x.url) === '/api/prompts').map((x) => x.body),
      [{ key: 'reweave', text: '' }], 'Reset sends it empty, which the route takes as the reset');
  } finally { doc.querySelector = wasQS; }
  click({ editprompt: 'reweave' });   // close it, for the checks after this one
  click({ tellertab: 'model' }); click({ panel: '' });
}
ok('Storyteller → Your voice shows When you reweave after the five modes, filled with the shipped note frame, and it saves and resets');

// ---- THE TALE'S OWN THREAD LIVES ON THE TALE PANEL'S THREAD TAB, AND ONLY THERE (Seth, 2026-10-29:
// "the tale thread under threads can be removed since it lives under tale now").
{
  click({ open: 's-1' });
  await sleep(40);
  click({ panel: 'threads' }); click({ backentry: '1' });   // a thread left open by an earlier check
  assert.doesNotMatch(html('sideBody'), /data-taleopen|talebanner/, 'NO-TALE-BANNER: Threads does not head its list with the tale');
  // ADR 0005 · A RULE IS A POCKET OF THE TALE (2026-10-29): drawn on this tab with its wake words.
  const wasRules = (STORY as any).taleRules;
  (STORY as any).taleRules = [{ id: 'r-1', name: 'Debts', body: 'A debt survives the debtor.', keys: ['debt', 'loan'], active: true }];
  click({ open: 's-1' }); await sleep(40);
  click({ storytab: 'thread' }); click({ panel: 'story' });
  assert.match(html('sideBody'), /data-tab="thread"/, 'TALE-TAB: the Tale panel opens on its Thread tab');
  assert.match(html('sideBody'), /data-storytab="thread"[^>]*aria-pressed="true"/, '  with the Thread chip pressed');
  const wasOwn = (STORY as any).talePockets, wasTale = (STORY as any).taleThread;
  // A tale with its own thread, so a rule saved with no thread is told apart from one saved on it.
  (STORY as any).taleThread = { id: 'e-tale', title: 'The tale', entryType: 'tale', addons: [], states: [] };
  (STORY as any).talePockets = [{ id: 'i-1', name: 'Slow burn', body: 'Nobody touches before scene ten.', active: true }];
  click({ open: 's-1' }); await sleep(40);
  click({ storytab: 'thread' }); click({ panel: 'story' });
  const tab = html('sideBody').match(/data-group="thread"[\s\S]*/)?.[0] ?? '';
  // ONE ＋, AND A ROW PER THING, OPENED BY A TAP (Seth, 2026-10-30: "Tale thread has alot of add
  // buttons we should throughout the app make any add a plus button with the entry and tabs kind of
  // like threads ... and edit is opened by tapping the field"). Rules, Your own and the strings are
  // rows that open the pocket panel; the one ＋ opens it to add any of the four.
  assert.match(tab, /data-taleadd="1"/, 'TALE-PLUS: the Thread tab has one ＋ to add to it');
  assert.doesNotMatch(tab, /data-addtalerule|data-addtalepocket|data-stringnew|data-rulenew|data-talenew|data-saverule/,
    'TALE-PLUS: and no add forms, Save buttons or second add presses');
  assert.match(tab, /class="pocketopen" data-editroom="r-1"[\s\S]*?Debts[\s\S]*?Rule/, 'TALE-ROWS: a rule is a row that opens');
  assert.match(tab, /class="pocketopen" data-editroom="i-1"[\s\S]*?Slow burn[\s\S]*?Your own/, '  and so is an instruction of your own');
  assert.match(tab, /data-addonon="r-1:0"/, '  each with its switch');
  // The ＋: the pocket panel on the tale's thread, offering all four kinds.
  click({ taleadd: '1' }); await sleep(20);
  let box = html('pocketPanel');
  assert.deepStrictEqual([...box.matchAll(/data-pocketkind="(\w+)"/g)].map((m) => m[1]), ['promise', 'question', 'rule', 'instruction'],
    'TALE-KINDS: the ＋ offers a promise, an open question, a rule and one of your own');
  click({ pocketkind: 'rule' }); await sleep(10);
  box = html('pocketPanel');
  assert.match(box, /id="pk-keys"/, '  a rule has wake words');
  for (const [id, value] of [['pk-name', 'Oaths'], ['pk-body', 'An oath binds the heir.'], ['pk-keys', 'oath, vow']])
    (listeners.input ?? []).forEach((f: Function) => f({ target: { id, value } }));
  POSTED.length = 0;
  click({ pocketsave: '1' }); await sleep(40);
  const made = POSTED.find((x) => x.url === '/api/addon');
  assert.strictEqual(made?.body.entryId, null, 'TALE-RULE-SAVE: a rule is a pocket of no thread');
  assert.deepStrictEqual({ slot: made?.body.addon.slot, name: made?.body.addon.name, keys: made?.body.addon.keys },
    { slot: 'rule', name: 'Oaths', keys: ['oath', 'vow'] }, '  with its name and wake words');
  // A tap on the row opens it.
  click({ open: 's-1' }); await sleep(40);
  click({ storytab: 'thread' }); click({ panel: 'story' });
  click({ editroom: 'r-1' }); await sleep(20);
  box = html('pocketPanel');
  assert.match(box, /id="pk-name" value="Debts"/, 'TALE-OPEN: tapping a rule opens it in the panel');
  assert.match(box, /id="pk-keys" value="debt, loan"/, '  with its wake words');
  assert.doesNotMatch(box, /data-pocketkind="promise"/, '  and it cannot become a string');
  click({ pocketx: '1' });
  // WHERE THE TALE STANDS, TAPPED (Seth, 2026-10-31: "the tale's is not editable"). The tale has no box
  // of its own on The thread, so its entry in force opens in the panel with its text in a box, and a
  // pause writes it to the tale's thread.
  (STORY as any).taleThread = { ...(STORY as any).taleThread, nowStateId: 'ts-2',
    states: [{ id: 'ts-2', fromChapter: 2, body: 'The heir is in hiding.', beforeMode: 'hide', label: null }] };
  click({ open: 's-1' }); await sleep(40);
  click({ storytab: 'thread' }); click({ panel: 'story' });
  assert.match(html('sideBody'), /<button[^>]*data-talestand="ts-2"[^>]*>The heir is in hiding\.</, 'TALE-NOW-TAP: where the tale stands is a press');
  click({ talestand: 'ts-2' }); await sleep(20);
  box = html('pocketPanel');
  assert.match(box, /id="pk-body"[^>]*>The heir is in hiding\.</, 'TALE-NOW-EDIT: it opens with its text in a box');
  POSTED.length = 0;
  (listeners.input ?? []).forEach((f: Function) => f({ target: { id: 'pk-body', value: 'The heir has come out of hiding.' } }));
  await sleep(1200);
  const st = POSTED.find((x) => x.url === '/api/state');
  assert.deepStrictEqual([st?.body.entryId, st?.body.state?.id, st?.body.state?.body], ['e-tale', 'ts-2', 'The heir has come out of hiding.'],
    "TALE-NOW-SAVE: a pause writes it to the tale's thread");
  click({ pocketdone: '1' }); await sleep(40);
  // REWRITE WHERE IT STANDS (Seth, 2026-10-31): a button under it, which asks for a card and writes nothing.
  click({ open: 's-1' }); await sleep(40);
  click({ storytab: 'thread' }); click({ panel: 'story' });
  assert.match(html('sideBody'), /<button[^>]*data-restand="e-tale"[^>]*>Rewrite where it stands</, 'RESTAND-BUTTON: the tale has the button');
  POSTED.length = 0;
  const realFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async (url: string, init?: any) => url === '/api/restand'
    ? (POSTED.push({ url, body: JSON.parse(init.body) }), { ok: true, status: 200, json: async () => ({ added: 1, ...STORY }) })
    : realFetch(url, init);
  click({ restand: 'e-tale' }); await sleep(40);
  (globalThis as any).fetch = realFetch;
  assert.deepStrictEqual(POSTED.find((x) => x.url === '/api/restand')?.body, { storyId: 's-1', entryId: 'e-tale' },
    'RESTAND-ASKS: the press asks for the tale\'s own thread');
  (STORY as any).taleRules = wasRules; (STORY as any).talePockets = wasOwn; (STORY as any).taleThread = wasTale;
  click({ panel: 'threads' });
}
ok("the tale's own thread is on the Tale panel's Thread tab, one ＋ adds to it and a tap opens a row");

// ---- OVER TIME: ONE ＋, AND A TAP OPENS A CHANGE (Seth, 2026-10-30: "throughout the app make any add
// a plus button with the entry and tabs kind of like threads to keep the ui simple and edit is opened
// by tapping the field"). The Over time tab had an add form under its list and a set of boxes with
// Save on every change; each is a row now, and the pocket panel holds the boxes.
{
  const was = STORY.entries;
  const at = (st: any[], now: string | null) => {
    STORY.entries = was.map((e: any) => e.id === 'e-1' ? { ...e, states: st, nowStateId: now } : e);
  };
  const LATER = { id: 'st-3', fromChapter: 3, body: '[Envoy Sereth: speaks for Kesh; owes the crowns]',
    label: 'owes the crowns', beforeMode: 'hide' };
  at([LATER], null);
  const openTime = async () => {
    click({ open: 's-1' }); await sleep(40);
    click({ panel: 'threads' }); click({ entry: 'e-1' }); click({ cardview: 'form' }); click({ cardtab: 'time' });
    await sleep(20);
    return html('sideBody').match(/<div class="pane"(?![^>]*hidden)[^>]*>[\s\S]*?Timeline[\s\S]*/)?.[0] ?? '';
  };
  let pane = await openTime();
  assert.match(pane, /data-addstate="1" class="headadd"/, 'OT-PLUS: Over time has one ＋ to add a change');
  assert.doesNotMatch(pane, /data-st="|data-stb=|data-stf=|data-stl=|data-savestate/,
    'OT-PLUS: and no add form or Save buttons in the list');
  assert.match(pane, /class="pocketopen" data-stateopen="st-3"[\s\S]*?Scene 3[\s\S]*?owes the crowns/,
    'OT-ROWS: a change is a row with its scene and label, that opens');
  assert.match(pane, /data-otrow="3"/, '  marked with its scene');
  // The ＋: the panel, with the fields a change has and no kinds or Ask Anansi.
  click({ addstate: '1' }); await sleep(20);
  let box = html('pocketPanel');
  for (const id of ['pk-from', 'pk-mode', 'pk-body', 'pk-label'])
    assert.match(box, new RegExp(`id="${id}"`), `OT-NEW: the ＋ opens the panel with ${id}`);
  assert.match(box, /id="pk-from"[^>]*value="2"/, '  its scene the one being written');
  assert.doesNotMatch(box, /data-pocketkind|data-pockettab|data-delstate/, '  and no kinds, tabs or Remove');
  assert.match(box, /data-pocketx="1"[\s\S]*data-savestate="1">Add</, 'ADD-CHANGE: a new change has Cancel and Add in its foot');
  const type = (id: string, value: string) => (listeners.input ?? []).forEach((f: Function) => f({ target: { id, value } }));
  type('pk-from', '4'); type('pk-mode', 'hint'); type('pk-body', '[Envoy Sereth: gone home]'); type('pk-label', 'went home');
  POSTED.length = 0;
  click({ savestate: '1' }); await sleep(40);
  assert.deepStrictEqual(POSTED.filter((x) => x.url === '/api/state').map((x) => x.body),
    [{ storyId: 's-1', entryId: 'e-1', state: { fromChapter: 4, body: '[Envoy Sereth: gone home]', beforeMode: 'hint', label: 'went home' } }],
    'OT-NEW-SAVE: Save adds the change as typed, with no id');
  assert.strictEqual(html('pocketPanel'), '', '  and shuts the panel');
  // A tap on a row opens that change, every field in a box, with Remove.
  pane = await openTime();
  click({ stateopen: 'st-3' }); await sleep(20);
  box = html('pocketPanel');
  assert.match(box, /id="pk-from"[^>]*value="3"/, 'OT-OPEN: tapping a change opens it on its scene');
  assert.match(box, /id="pk-label"[^>]*value="owes the crowns"/, '  its label');
  assert.match(box, /id="pk-body"[^>]*>\[Envoy Sereth: speaks for Kesh; owes the crowns\]</, '  and where it stands');
  assert.match(box, /data-delstate="st-3"/, '  with Remove inside it');
  // SAVED AS YOU TYPE (ADR 0004, pass three): a change that exists has Undo my changes and Done.
  assert.doesNotMatch(box, /data-savestate|>Save</, 'OT-NO-SAVE: an open change has no Save');
  assert.match(box, /data-pocketundo="1"[\s\S]*data-pocketdone="1"/, 'OT-FOOT: Undo my changes and Done in its foot');
  const states = () => POSTED.filter((x) => x.url === '/api/state').map((x) => x.body.state);
  POSTED.length = 0;
  type('pk-label', 'owes twelve crowns');
  await sleep(400);
  assert.deepStrictEqual(states(), [], 'OT-PAUSE: nothing is written while the typing goes on');
  await sleep(700);
  assert.deepStrictEqual(states(), [{ id: 'st-3', fromChapter: 3, body: LATER.body, beforeMode: 'hide', label: 'owes twelve crowns' }],
    'OT-AUTOSAVE: the pause writes that change, by its id');
  type('pk-from', '5');
  click({ pocketdone: '1' }); await sleep(40);
  assert.deepStrictEqual(states().at(-1), { id: 'st-3', fromChapter: 5, body: LATER.body, beforeMode: 'hide', label: 'owes twelve crowns' },
    'OT-DONE: Done writes the last of the typing');
  assert.strictEqual(html('pocketPanel'), '', '  and shuts the panel');
  // A scene number is needed, so an emptied one is not written, and Done says so and stays.
  click({ stateopen: 'st-3' }); await sleep(20);
  POSTED.length = 0;
  type('pk-from', '');
  await sleep(1000);
  click({ pocketdone: '1' }); await sleep(40);
  assert.deepStrictEqual(states(), [], 'OT-NEVER: an empty scene number is never written');
  assert.notStrictEqual(html('pocketPanel'), '', '  and Done stays open');
  // Undo my changes, with something typed, asks twice and puts it back.
  type('pk-from', '3'); type('pk-label', 'changed my mind');
  await sleep(1000);
  click({ pocketundo: '1' }); await sleep(10);
  assert.notStrictEqual(html('pocketPanel'), '', 'OT-UNDO-ASKS: Undo my changes with a change typed asks first');
  click({ pocketundo: '1' }); await sleep(40);
  assert.deepStrictEqual(states().map((s: any) => s.label), ['changed my mind', 'owes the crowns'],
    'OT-UNDO: the second press writes back what it opened on');
  assert.strictEqual(html('pocketPanel'), '', '  and shuts it');
  // THE ONE IN FORCE: its text is The thread's box, so the panel shows it and does not hold a second box.
  at([LATER], 'st-3');
  pane = await openTime();
  assert.match(pane, /data-stateopen="first"[\s\S]*?From scene 1/, 'OT-FIRST: scene 1 is a row that opens while a later change is in force');
  click({ stateopen: 'st-3' }); await sleep(20);
  box = html('pocketPanel');
  assert.doesNotMatch(box, /id="pk-body"/, 'OT-NOW: the change in force has no second box for its text');
  assert.match(box, /edited on The thread/, '  and says where it is edited');
  click({ pocketx: '1' }); await sleep(10);
  // Scene 1, while a later change is in force: the thread's own text, saved as the thread.
  click({ stateopen: 'first' }); await sleep(20);
  box = html('pocketPanel');
  assert.match(box, /id="pk-body"[^>]*>\[speaks for Kesh\]</, 'OT-FIRST-OPEN: scene 1 opens on the thread\'s own text');
  assert.doesNotMatch(box, /id="pk-from"|id="pk-label"|data-delstate/, '  with no scene, label or Remove: it is the thread itself');
  // SAVED AS YOU TYPE, as the thread (ADR 0004, pass three): a pause writes a draft, which keeps no
  // revision and stales nothing, and Done the last write, naming the text it opened on.
  assert.doesNotMatch(box, /data-savestate|>Save</, 'OT-FIRST-NO-SAVE: scene 1 has no Save');
  assert.match(box, /data-pocketundo="1"[\s\S]*data-pocketdone="1"/, 'OT-FIRST-FOOT: Undo my changes and Done in its foot');
  const entries = () => POSTED.filter((x) => x.url === '/api/entry').map((x) => x.body);
  POSTED.length = 0;
  type('pk-body', '[speaks for Kesh, and for herself]');
  await sleep(1000);
  const sent = entries()[0];
  assert.deepStrictEqual({ id: sent?.entry.id, body: sent?.entry.body, title: sent?.entry.title, draft: sent?.draft },
    { id: 'e-1', body: '[speaks for Kesh, and for herself]', title: 'Envoy Sereth', draft: true },
    'OT-FIRST-DRAFT: the pause writes it as the thread\'s text, as a draft');
  click({ pocketdone: '1' }); await sleep(40);
  assert.deepStrictEqual(entries().slice(1).map((b: any) => [b.entry.body, b.draft ?? null, b.opened]),
    [['[speaks for Kesh, and for herself]', null, { body: '[speaks for Kesh]' }]],
    'OT-FIRST-DONE: Done sends the last write, naming the text it opened on');
  assert.strictEqual(html('pocketPanel'), '', '  and shuts it');
  // With no later change in force, scene 1 IS where it stands now, edited on The thread: not a row that opens.
  at([LATER], null);
  pane = await openTime();
  assert.doesNotMatch(pane, /data-stateopen="first"/, 'OT-FIRST-NOW: scene 1 does not open while it is where it stands now');
  STORY.entries = was;
  click({ cardview: null }); click({ backentry: '1' });
}
ok('Over time: one ＋ adds a change, a tap opens one in the pocket panel, and one that exists saves as you type');

// ---- SCENE SUMMARIES AND CHAPTERS: A TAP OPENS ONE (Seth, 2026-10-30: "edit is opened by tapping the
// field"). Each was a card with its buttons on it and Alter opening boxes and Save inside the list;
// each is a row now, and the pocket panel holds the boxes, the presses and Save. Gathering scenes
// into a chapter stays the add, and hems make summaries, so neither list has a ＋.
{
  const canned = (globalThis as any).fetch;
  const ARC = { id: 'a-1', fromChapter: 1, toChapter: 1, title: 'The Ash', summary: 'Ilva comes in on the ash road.', outOfDate: null };
  const wasArcs = STORY.arcs;
  STORY.arcs = [ARC];
  // A server that refuses the write, for the checks that a refusal is said.
  let refuse = false;
  (globalThis as any).fetch = async (url: string, init?: any) => {
    if (init?.body && ['/api/summary', '/api/arc', '/api/chapter'].includes(url)) {
      POSTED.push({ url, body: JSON.parse(init.body), method: init.method });
      if (refuse) return { ok: false, status: 500, json: async () => ({ error: 'the disk is full' }) };
      return { ok: true, status: 200, json: async () => STORY, text: async () => JSON.stringify(STORY) };
    }
    return canned(url, init);
  };
  const group = async () => {
    click({ open: 's-1' }); await sleep(40);
    click({ panel: 'chapter' }); click({ chaptab: 'summaries' }); await sleep(20);
    return html('sideBody').match(/data-group="summaries"[\s\S]*?(?=data-group="branches")/)?.[0] ?? '';
  };
  const type = (dataset: any, value: string) => (listeners.input ?? []).forEach((f: Function) =>
    f({ target: { id: '', dataset, value, closest: () => null } }));
  let g = await group();
  assert.match(g, /class="pocketopen" data-editsum="c-1"[\s\S]*?Ilva arrives\./, 'SUM-ROWS: a scene summary is a row that opens');
  assert.doesNotMatch(g, /data-sumtext|data-savesum|data-summarize="c-1"|data-pullback/,
    'SUM-ROWS: and no box, Save, Summarise again or Pull back on the list');
  assert.match(g, /class="pocketopen" data-editarc="a-1"[\s\S]*?The Ash/, 'ARC-ROWS: a chapter is a row that opens');
  assert.doesNotMatch(g, /data-arctext|data-arctitle|data-savearc|data-delarc/, 'ARC-ROWS: and no boxes, Save or ✕ on the list');
  // A summary's panel: its box with the word count, Summarise again, Pull back, Undo my changes and
  // Done. It saves as you type (ADR 0004, pass three): there is no Save.
  const sums = () => POSTED.filter((x) => x.url === '/api/summary').map((x) => x.body.summary);
  click({ editsum: 'c-1' }); await sleep(20);
  let box = html('pocketPanel');
  assert.match(box, /<textarea[^>]*data-sumtext="c-1"[^>]*>Ilva arrives\.</, 'SUM-OPEN: tapping it opens the panel on its text');
  assert.match(box, /data-wordcount/, '  with its word count');
  assert.match(box, /data-summarize="c-1"/, '  Summarise again');
  assert.match(box, /data-pullback="c-1" data-on="1"/, '  and Pull back');
  assert.doesNotMatch(box, /data-savesum|>Save</, 'SUM-NO-SAVE: and no Save');
  assert.match(box, /data-pocketundo="1"[^>]*>Undo my changes<[\s\S]*data-pocketdone="1"[^>]*>Done</, 'SUM-FOOT: Undo my changes and Done in its foot');
  POSTED.length = 0;
  type({ sumtext: 'c-1', wordcap: '220' }, 'Ilva arrives at dusk.');
  await sleep(400);
  assert.deepStrictEqual(sums(), [], 'SUM-PAUSE: nothing is written while the typing goes on');
  await sleep(700);
  assert.deepStrictEqual(POSTED.filter((x) => x.url === '/api/summary').map((x) => x.body),
    [{ storyId: 's-1', chapterId: 'c-1', summary: 'Ilva arrives at dusk.' }], 'SUM-AUTOSAVE: the pause writes what was typed');
  type({ sumtext: 'c-1', wordcap: '220' }, 'Ilva arrives at dusk, alone.');
  click({ pocketdone: '1' }); await sleep(40);
  assert.deepStrictEqual(sums(), ['Ilva arrives at dusk.', 'Ilva arrives at dusk, alone.'], 'SUM-DONE: Done writes the last of the typing');
  assert.strictEqual(html('pocketPanel'), '', '  and shuts the panel');
  await sleep(1000);
  assert.strictEqual(sums().length, 2, '  and the pause that was waiting writes nothing more');
  // EMPTY IS NOT WRITTEN BY THE PAUSE: an empty summary is a removed one, and that takes two presses.
  g = await group();
  click({ editsum: 'c-1' }); await sleep(20);
  POSTED.length = 0;
  type({ sumtext: 'c-1', wordcap: '220' }, '');
  await sleep(1000);
  assert.deepStrictEqual(sums(), [], 'SUM-EMPTY-HELD: emptied, the pause writes nothing');
  click({ pocketdone: '1' }); await sleep(20);
  assert.notStrictEqual(html('pocketPanel'), '', 'SUM-EMPTY-ASKS: Done on an empty summary asks first');
  click({ pocketdone: '1' }); await sleep(40);
  assert.deepStrictEqual(sums(), [''], 'SUM-EMPTY-REMOVES: the second press removes it');
  assert.strictEqual(html('pocketPanel'), '', '  and shuts the panel');
  // UNDO MY CHANGES, with something written, asks, then writes back what was there when it opened.
  g = await group();
  click({ editsum: 'c-1' }); await sleep(20);
  POSTED.length = 0;
  type({ sumtext: 'c-1', wordcap: '220' }, 'Something else.');
  await sleep(1000);
  click({ pocketundo: '1' }); await sleep(10);
  assert.notStrictEqual(html('pocketPanel'), '', 'SUM-UNDO-ASKS: Undo my changes with a change typed asks first');
  click({ pocketundo: '1' }); await sleep(40);
  assert.deepStrictEqual(sums(), ['Something else.', 'Ilva arrives.'], 'SUM-UNDO: the second press puts the summary back as it was');
  assert.strictEqual(html('pocketPanel'), '', '  and shuts the panel');
  // A REFUSED WRITE IS SAID, and Done keeps the panel open with the words in it.
  g = await group();
  click({ editsum: 'c-1' }); await sleep(20);
  POSTED.length = 0; refuse = true;
  type({ sumtext: 'c-1', wordcap: '220' }, 'Kept?');
  await sleep(1000);
  assert.match(String(nodes.get('toast').textContent), /Not saved\. the disk is full/, 'SUM-REFUSED: a refused write is said');
  click({ pocketdone: '1' }); await sleep(40);
  assert.match(html('pocketPanel'), /data-sumtext="c-1"/, 'SUM-REFUSED-OPEN: Done keeps the panel open');
  refuse = false;
  click({ pocketdone: '1' }); await sleep(40);
  assert.deepStrictEqual(sums(), ['Kept?', 'Kept?', 'Kept?'], 'SUM-REFUSED-RETRY: and writes them once the server takes them');
  assert.strictEqual(html('pocketPanel'), '', '  and shuts');
  // A chapter's panel: its title and summary, Remove inside it, Undo my changes and Done. It saves as
  // you type (ADR 0004, pass three).
  const arcs = () => POSTED.filter((x) => x.url === '/api/arc' && x.method === 'POST').map((x) => x.body);
  click({ editarc: 'a-1' }); await sleep(20);
  box = html('pocketPanel');
  assert.match(box, /data-arctitle[^>]*value="The Ash"/, 'ARC-OPEN: tapping a chapter opens its title');
  assert.match(box, /<textarea[^>]*data-arctext[^>]*>Ilva comes in on the ash road\.</, '  and its summary');
  assert.match(box, /data-delarc="a-1"/, '  with Remove inside it');
  assert.doesNotMatch(box, /data-savearc|>Save</, 'ARC-NO-SAVE: and no Save');
  assert.match(box, /data-pocketundo="1"[\s\S]*data-pocketdone="1"/, 'ARC-FOOT: Undo my changes and Done in its foot');
  POSTED.length = 0;
  type({ arctitle: '' }, 'The Ash Road');
  await sleep(1000);
  assert.deepStrictEqual(arcs(), [{ storyId: 's-1', id: 'a-1', title: 'The Ash Road', summary: ARC.summary }],
    'ARC-AUTOSAVE: the pause writes the title and summary');
  type({ arctext: '' }, 'Ilva comes in on the ash road, late.');
  click({ pocketdone: '1' }); await sleep(40);
  assert.deepStrictEqual(arcs().map((b: any) => b.summary), [ARC.summary, 'Ilva comes in on the ash road, late.'],
    'ARC-DONE: Done writes the last of the typing');
  assert.strictEqual(html('pocketPanel'), '', '  and shuts the panel');
  // EMPTY CANNOT BE SAVED (the route refuses it; Remove is how a chapter goes), so the pause does not
  // write it and Done says so and stays.
  g = await group();
  click({ editarc: 'a-1' }); await sleep(20);
  POSTED.length = 0;
  type({ arctext: '' }, '  ');
  await sleep(1000);
  assert.deepStrictEqual(arcs(), [], 'ARC-EMPTY-HELD: emptied, the pause writes nothing');
  click({ pocketdone: '1' }); await sleep(40);
  assert.deepStrictEqual(arcs(), [], 'ARC-EMPTY-DONE: and neither does Done');
  assert.match(String(nodes.get('toast').textContent), /cannot be empty/, '  which says why');
  assert.notStrictEqual(html('pocketPanel'), '', '  and stays open');
  // Undo my changes puts back what was there, writing nothing when nothing was written.
  click({ pocketundo: '1' }); click({ pocketundo: '1' }); await sleep(40);
  assert.deepStrictEqual(arcs(), [], 'ARC-UNDO-NOTHING: Undo after nothing was written writes nothing');
  assert.strictEqual(html('pocketPanel'), '', '  and shuts the panel');
  g = await group();
  click({ editarc: 'a-1' }); await sleep(20);
  POSTED.length = 0;
  type({ arctitle: '' }, 'Wrong title');
  await sleep(1000);
  click({ pocketundo: '1' }); click({ pocketundo: '1' }); await sleep(40);
  assert.deepStrictEqual(arcs().map((b: any) => b.title), ['Wrong title', 'The Ash'], 'ARC-UNDO: Undo writes back the title it opened with');
  g = await group();
  click({ editarc: 'a-1' }); await sleep(20);
  POSTED.length = 0;
  click({ delarc: 'a-1' }); click({ delarc: 'a-1' }); await sleep(40);
  assert.deepStrictEqual(POSTED.filter((x) => x.url === '/api/arc').map((x) => [x.method, x.body.id]), [['DELETE', 'a-1']],
    'ARC-DEL: Remove, pressed twice, removes the chapter');
  assert.strictEqual(html('pocketPanel'), '', '  and shuts the panel');
  (globalThis as any).fetch = canned;
  STORY.arcs = wasArcs;
  click({ chaptab: 'this' }); click({ panel: 'threads' });
}
ok('scene summaries and chapters are rows that open in the pocket panel, with their presses and Save there');

// ---- THE THREAD'S MENU, ONE FLAT LIST, AND TIDY AS AN ICON BESIDE IT (Seth, 2026-10-27).
{
  click({ entry: 'e-1' });
  const head = html('sideHead');
  assert.match(head, /<button data-tidy="e-1" class="headmore"/, 'Tidy is an icon in the header');
  assert.doesNotMatch(head, /&middot;&middot;&middot;/, 'and the menu is no longer three dots');
  click({ readmenu: '1' });
  const menu = html('sideBody');
  assert.doesNotMatch(menu, /class="readrow"[^>]*data-tidy|data-tidy="e-1" class="readrow"/, 'Tidy is not in the menu');
  assert.match(menu, /data-cardview="form" class="readrow"/, 'Alter stays in sight');
  assert.doesNotMatch(menu, /<details/, 'and no folds inside it: the menu is the one toggle (Seth, 2026-10-27)');
  assert.match(menu, /data-delentry="1" class="readrow danger"/, 'every row in one list, Delete last');
  click({ readmenu: '1' });
}
ok("the thread's menu is one flat list, and Tidy is an icon beside it");

// ---- POLISH PASS, 2026-09-01 · WHAT IS ON AND WHERE YOU ARE, SAID AND NOT ONLY COLOURED.
//
// Four controls carried their state in a colour and nothing else: the rail's open row, the current
// chapter, the outfit chips on a card face, and the seed picker. Everything else that looked
// stateful already says so in its own label ("Worn — take it off", "In play — put it away"), which
// is why this is four and not seventeen.
//
// ASSERTED AS A PAIRING, never as a presence. The lore chips shipped with `aria-pressed` keyed to
// `S.loreKind` while the style read `S.lore.kind`, so it sat permanently false under a lit button
// and a check for "aria-pressed exists" was green throughout. So each assertion below ties the
// attribute to the same condition the colour uses.
{
  click({ open: 's-1' });
  await sleep(40);

  // THE RAIL: exactly one row is the one you are on. `aria-current`, not `aria-pressed` — these
  // are places you go, one of which you are at, rather than switches.
  const rail = html('rail');
  const current = [...rail.matchAll(/data-nav="([a-z]+)"([^>]*)/g)]
    .filter((m) => /aria-current="page"/.test(m[2])).map((m) => m[1]);
  assert.strictEqual(current.length, 1,
    `exactly one rail row is current and ${current.length} claim to be`);
  // AND IT IS THE LIT ONE. This is the pairing: the rule beside it and the aria have to name the
  // same row, or the attribute is decoration that happens to be present. (ADR 0004: the row you
  // are on is bright ink with a rule, not a gold background.)
  const lit = [...rail.matchAll(/data-nav="([a-z]+)"([^>]*?)>/g)]
    .filter((m) => /border-left:2px solid var\(--ink-bright\)/.test(m[2])).map((m) => m[1]);
  assert.deepStrictEqual(current, lit, 'the row that reads as current must be the row that is lit');

  // THE CHAPTER LIST: same rule, and the fixture has more than one chapter so it can fail.
  click({ railview: 'story' });
  await sleep(30);
  const chapters = [...html('rail').matchAll(/data-chapter="([^"]+)"([^>]*?)>/g)];
  // Asserted rather than guarded: it was `if (chapters.length > 1)` with no else, so a rail that
  // drew no chapter rows at all skipped both checks below and printed green.
  assert.ok(chapters.length > 1, `the rail lists the fixture's chapters, and it drew ${chapters.length}`);
  {
    const marked = chapters.filter((m) => /aria-current="true"/.test(m[2])).map((m) => m[1]);
    assert.strictEqual(marked.length, 1, 'one chapter is the one you are writing');
    assert.strictEqual(marked[0], 'c-2', 'and it is the open one, not the first in the list');
  }

  // THE FULL WORN CONTROL SAYS ITS STATE IN WORDS, which is why it needs no aria and the chip on
  // the Threads list does. Asserted so the reasoning cannot be quietly undone: strip the label down
  // to the coat's name and this fails, and the control would then need what the chip needs.
  // The CHIP's pairing is checked in test/web.ts against its own source, alongside the five other
  // button groups — the Threads list keeps a tray open across this file's earlier blocks and the
  // panel could not be reached from here without unwinding it.
  click({ entry: 'e-1' });
  click({ cardview: 'form' });
  await sleep(30);
  const worn = html('sideBody');
  assert.match(worn, /data-wear="e-1:o-worn"[^>]*>\s*Worn — take it off/,
    'the coat that is on says so in its label');
  assert.match(worn, /data-wear="e-1:o-hung"[^>]*>\s*Wear this/, 'and the one that is not');
  click({ cardview: null });
  click({ backentry: '1' });
  ok('the rail and the chapter list say which one is on, and the aria matches the colour');

  // ---- AND A LABEL IS PAIRED TO ITS CONTROL, not merely sitting above it.
  //
  // `<label class="lbl">X</label>` followed by an input LOOKS labelled and is not: nothing joins
  // them, so the box has no accessible name and tapping the word does not focus it. Fixed in the
  // three wizard helpers and the Story panel's field loop, which is where most of this app's fields
  // come from — four sites rather than the sixty-odd call sites.
  click({ panel: 'story' });
  await sleep(30);
  const story = html('sideBody');
  const fors = [...story.matchAll(/<label[^>]*\bfor="([^"]+)"/g)].map((m) => m[1]);
  const ids = new Set([...story.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  assert.ok(fors.length >= 3, `the Story panel should pair its fields and pairs ${fors.length}`);
  // EVERY `for` RESOLVES. A `for` naming an id that is not on the page is worse than none: it reads
  // as done and names nothing.
  const dangling = fors.filter((f) => !ids.has(f));
  assert.deepStrictEqual(dangling, [], 'every label points at a control that is actually there');
  ok('the Story panel pairs each label to its field, and every pairing resolves');
}

// ---- ISSUE #36 · THREE FACES, ONE CARD AT A TIME.
//
// Following a world book was all or nothing: `stories.lore_from` is one column, so every thread in
// it reached this book, live, and no single one could be excepted. Seth's ask was per card, and his
// design was a copy that remembers where it came from. Three states, three faces, and each face has
// to offer only the presses that can actually work from where the card lives.
{
  click({ open: 's-1' });
  await sleep(40);
  click({ panel: 'threads' });

  // ---- READ THROUGH from the book this one follows. One card, not two copies kept in step.
  click({ entry: 'e-shared' });
  await sleep(30);
  const shared = html('sideBody');
  assert.match(shared, /This thread lives in The Ash Cycle/, 'the face says where it lives');
  // THE BODY IS EDITABLE AND SAVES TO THE OTHER BOOK. It could not before: `upsertEntry` is scoped
  // by story, so a save from here did not resolve the id and MINTED A DUPLICATE — two cards with
  // one name, drifting, and the writer believing they had edited the shared one. That is why this
  // face was read-only, and `db.upsertEntry`'s redirect is what makes the box safe.
  assert.match(shared, /data-followedbody="e-shared"/, 'its description can be edited here');
  assert.match(shared, /data-savefollowed="e-shared"/, 'and saved');
  // RENAMED Send to (Seth, 2026-10-30): it sends the words to the book the thread lives in.
  assert.match(shared, /Send to The Ash Cycle/, 'SEND-TO: saying which book the words are sent to');
  assert.doesNotMatch(shared, /Save to /, '  and no longer Save to');
  assert.match(shared, /data-takeover="e-shared"/, 'it can be taken over');
  assert.match(shared, /data-dropfollow="e-shared"/, 'or taken out of this book');
  // AND NOT THE PRESSES THAT CANNOT WORK FROM HERE. `upsertAddon`, the states and the outfits all
  // require the card to belong to THIS story and correctly refuse otherwise, so drawing those
  // controls on a followed card would draw presses that silently do nothing.
  assert.doesNotMatch(shared, /data-invent=/, 'no room controls on a card that lives elsewhere');
  assert.doesNotMatch(shared, /data-addstate=/, 'and no timeline');
  // Nor the presses that belong to a card this book took over — it has not taken this one over.
  assert.doesNotMatch(shared, /data-sendup=/, 'nothing to send up: this is not a copy');
  assert.doesNotMatch(shared, /data-handback=/, 'and nothing to hand back');

  // ---- TAKEN OVER. An ordinary card of this book that remembers the origin, so there are two
  // ways back and the face has to offer both — keeping this version or keeping the world's.
  click({ entry: 'e-took' });
  await sleep(30);
  const took = html('sideBody');
  assert.match(took, /This tale's own copy, taken from The Ash Cycle/,
    'the face says it is a copy and where from — otherwise it is indistinguishable from a card '
    + 'born here and the connection it still holds is invisible');
  assert.match(took, /data-sendup="e-took"/, 'this version can go up and follow again');
  assert.match(took, /data-handback="e-took"/, 'or be dropped in favour of the shared one');
  assert.doesNotMatch(took, /data-takeover="e-took"/, 'it is already taken over');
  assert.doesNotMatch(took, /data-savefollowed="e-took"/,
    'and it saves through the ordinary card form, not through the followed-card box');

  // ---- TAKEN OUT. A tombstone is not a card, so it is not in `entries` at all — it is listed by
  // name under Part of a world. Without that list, removing a thread is a one-way door with no
  // undo on any screen.
  click({ panel: 'story' });
  await sleep(30);
  const story = html('sideBody');
  assert.match(story, /Taken out of this tale/, 'what this book has removed is named');
  assert.match(story, /The Quay Office/, 'by title');
  assert.match(story, /data-bringback="e-stone"/, 'with the way back beside it');
  ok('a followed thread can be edited, taken over, or taken out — and each face offers only what '
    + 'works from where the card lives (#36)');

// ---- A PASSAGE THAT ARRIVES LANDS YOU AT THE END OF THE ONE BEFORE IT.
//
// Seth, 2026-09-01: *"every new message that comes in should scroll to the bottom of the last message
// not the new message to make it easier to read."*
//
// The seam pin already did that and had ONE caller — the writer's own send. Everything else fell
// through to scroll-to-bottom: a passage the server finished while the phone was in a pocket,
// Continue, a re-roll, and the other writer's passage arriving on a refresh. The rule lives in
// `drawDoc` now, where every path already passes.
//
// ASSERTED BY WHERE THE PAGE LANDS, not by whether a function was called. `pinTo` measures the seam
// and scrolls above the bottom; the fallback slams to `scrollHeight`. The two are different numbers.
{
  click({ open: 's-1' });
  await sleep(40);
  const read = nodes.get('read');
  // A DETERMINISTIC REDRAW OF THE COLUMN AND NOTHING ELSE. `readmode` calls `drawDoc()` directly and
  // setting it to the value it already has changes no state — so each call is exactly one draw,
  // which is what the "only once" assertion below needs.
  const redraw = () => click({ readmode: '0' });
  // The pane has to look scrollable and be AT the tip, or the rule is skipped by design — a writer
  // who has scrolled up is left where they are.
  const atTip = () => { read.scrollHeight = 9000; read.clientHeight = 600; read.scrollTop = 8500; };
  // The seam's block, measured 500px down the pane. `pinTo` subtracts 72px of peek.
  const wasQS = (globalThis as any).document.querySelector;
  (globalThis as any).document.querySelector = (sel: string) =>
    /data-edit="p-5"/.test(sel) ? { closest: () => ({ getBoundingClientRect: () => ({ bottom: 500 }) }) }
    : null;
  try {
    // A REPAINT THAT CHANGED NOTHING MUST NOT MOVE THE PAGE — an edit, a panel, a toast, a result
    // landing a few seconds after a passage. Since 2026-10-27 it stays exactly
    // where it was; it went to the bottom whenever you were near it (Seth: "as soon as it's done it
    // moves the text to the bottom and it's really annoying").
    atTip();
    redraw();
    assert.strictEqual(read.scrollTop, 8500,
      'STAY-PUT: a repaint with the same newest passage leaves the page where it was');

    // NOW ONE ARRIVES. p-6 lands after p-5, so p-5 is the seam: 500 down, less 72 of peek, from a
    // pane already scrolled 8500 — the point is that it is NOT scrollHeight.
    STORY.passages.push({ id: 'p-6', chapterId: 'c-2', body: 'It arrived while you were away.',
      author: 'model', isBreak: false, ordinal: 99, variantIndex: 0, takes: 1, claimed: false } as any);
    atTip();
    redraw();
    assert.notStrictEqual(read.scrollTop, 9000,
      'a passage that arrived must not leave you at the bottom of the new prose');
    assert.strictEqual(read.scrollTop, 8500 + 500 - 72,
      'it lands at the end of the passage before it, less the peek');

    // AND ONLY ONCE. The same passage is not new on the next repaint.
    atTip();
    redraw();
    assert.strictEqual(read.scrollTop, 8500, 'the next repaint is an ordinary one again: it stays put');

    /* AND WHEN THE SEAM IS NOT ON THE PAGE, IT STILL MOVES. `pinTo` returns false so the caller
     * falls back to the bottom — reading mode draws every chapter, a jump can leave the seam
     * unrendered, and a pin that silently did nothing would leave a writer looking at prose from
     * before the one that just arrived. Falsified by making `pinTo` claim success on a missing
     * element, which every other assertion here survives. */
    (globalThis as any).document.querySelector = () => null;
    STORY.passages.push({ id: 'p-7', chapterId: 'c-2', body: 'And another.', author: 'model',
      isBreak: false, ordinal: 100, variantIndex: 0, takes: 1, claimed: false } as any);
    atTip();
    redraw();
    assert.strictEqual(read.scrollTop, 9000,
      'a seam it cannot find falls back to the bottom rather than leaving the page where it was');
    STORY.passages = STORY.passages.filter((p: any) => p.id !== 'p-7');
  } finally {
    (globalThis as any).document.querySelector = wasQS;
    STORY.passages = STORY.passages.filter((p: any) => p.id !== 'p-6');
  }
  ok('a passage that arrives leaves you at the end of the one before it, wherever it came from');
}

// ---- SEPARATION BETWEEN CHAPTERS IN A CONTINUOUS READ, and each one anchored.
//
// Seth, 2026-09-01: *"i ran a new chapter and the content of chapter one isnt gone but there no
// seperation anymore which i think is how you fixed me being able to read the entire thing ... it
// should still have seperation even if its an anchor link or something."* He is right about the
// cause: #37 made reading mode draw the whole book, and `.band` carries 8px of padding and no
// margin — invisible as the top of a column, nothing at all between two chapters.
{
  click({ open: 's-1' });
  await sleep(40);
  click({ readmode: '1' });
  await sleep(40);
  const doc = html('col');
  const chapters = [...doc.matchAll(/<section class="chap(?: [^"]*)?" id="ch-(\d+)"/g)].map((m) => m[1]);
  assert.ok(chapters.length > 1, `reading mode draws every chapter and drew ${chapters.length}`);
  // AN ANCHOR PER CHAPTER, which is the thing he offered as an acceptable minimum.
  assert.deepStrictEqual(chapters, [...new Set(chapters)], 'each anchor is its own chapter');
  // ONE BREAK FEWER THAN THERE ARE CHAPTERS: between them, never above the first, where it would be
  // a rule under the header with nothing above it to separate from.
  const breaks = (doc.match(/class="chapbreak(?: [^"]*)?"/g) ?? []).length;
  assert.strictEqual(breaks, chapters.length - 1,
    `${chapters.length} chapters want ${chapters.length - 1} breaks and got ${breaks}`);
  assert.ok(doc.indexOf('class="chapbreak"') > doc.indexOf('id="ch-1"'),
    'and the first break comes after the first chapter has started, not before it');
  click({ readmode: '0' });
  await sleep(30);
  // WRITING STILL DRAWS ONE, which is the trade #37 deliberately kept — so no break at all.
  assert.strictEqual((html('col').match(/class="chapbreak(?: [^"]*)?"/g) ?? []).length, 0,
    'writing draws one chapter, so there is nothing to separate');
  ok('a continuous read separates its chapters and anchors each one (#37 follow-up)');
}

// ---- A THREAD'S PICTURE IS AT THE TOP, IN EVERY VIEW A THREAD IS DRAWN IN.
//
// Seth, 2026-09-01: *"if a card has an image move it to the top and in all thread views i should be
// able to see it in the top."* It was one row inside the form, under the facts room — so on a card
// with a picture, the one thing you can recognise at a glance was the one thing you had to scroll
// past the words to reach, and the list and the read face never showed it at all.
//
// FOUR VIEWS, and the fixture gives `e-1` a picture and `e-2` none, so a view that draws one for
// every card fails as loudly as a view that draws none.
{
  const src = (html, id) => new RegExp(`<img\\b[^>]*\\bsrc="[^"]*entry=${id}[^"]*"`).test(html);
  const before = (html, needle, other) => {
    const a = html.indexOf(needle), b = html.indexOf(other);
    return a > -1 && b > -1 && a < b;
  };

  // 1 · THE LIST on the story's own Threads panel.
  //
  // `backentry` FIRST, and it is not defensive. Earlier blocks in this file leave a card open, and
  // the Threads panel then draws that card instead of the list — so without this the assertions
  // below read a card bar and report that the list has no pictures in it, which is true and not
  // what they are asking.
  click({ open: 's-1' });
  await sleep(40);
  click({ backentry: '1' });
  click({ panel: 'threads' });
  await sleep(30);
  // AND SHUT THE WRITE-IT-DOWN TRAY IF IT IS OPEN, which an earlier block leaves it. The panel draws
  // the tray INSTEAD of the list, so this is about reaching the list at all.
  //
  // KEYED ON THE LIST BEING ABSENT, not on a marker in the markup. `newlore` TOGGLES, and the closed
  // panel carries a `data-newlore` button of its own — so a guard that looked for that marker opened
  // the tray it was trying to close, and every assertion below then failed for the wrong reason.
  if (!/data-entry=/.test(html('sideBody'))) {
    click({ newlore: '1' });
    await sleep(30);
  }
  const list = html('sideBody');
  assert.match(list, /data-entry=/, 'the thread LIST is what these assertions read');
  assert.ok(src(list, 'e-1'), 'the list shows the picture of a thread that has one');
  assert.ok(!src(list, 'e-2'), 'and draws no frame for a thread that has none');
  // AT THE TOP OF ITS CARD, which is the whole request — asserted by position, because "the image
  // is somewhere in the markup" was true of the form before this and is not what was asked for.
  assert.ok(before(list, 'entry=e-1', 'Envoy Sereth'),
    "the picture comes before the thread's name in its card");

  // 2 · THE READ FACE.
  click({ entry: 'e-1' });
  await sleep(30);
  const face = html('sideBody');
  assert.ok(src(face, 'e-1'), 'the read face shows it');
  assert.ok(before(face, 'entry=e-1', 'Envoy Sereth'), 'above the name');

  // 3 · THE FORM. It was moved above the fields on 2026-09-01; since the v2 Alter screen it is
  // under More, at the top with the kind (Seth, 2026-10-25: "move em under more"). Both halves:
  // past the thread tab's fields, and first under More.
  click({ cardview: 'form' });
  await sleep(30);
  const form = html('sideBody');
  assert.ok(src(form, 'e-1'), 'the form shows it');
  assert.ok(before(form, 'f-card-body', 'entry=e-1'),
    'and the picture is not on The thread tab any more, it is past Info');
  assert.ok(before(form, 'entry=e-1', 'data-kind="character"'),
    'and it heads More, above the kind');
  click({ cardview: null });
  click({ backentry: '1' });

  // 4 · A FOLLOWED THREAD'S FACE. Its picture lives in the book the thread lives in, and this face
  // is read-only about everything else — the picture is the one thing it can still show.
  click({ panel: 'threads' });
  await sleep(30);
  click({ entry: 'e-shared' });
  await sleep(30);
  const shared = html('sideBody');
  assert.ok(src(shared, 'e-shared'), 'a followed thread shows its picture too');
  assert.ok(before(shared, 'entry=e-shared', 'The Ambersand'), 'above its name');
  click({ backentry: '1' });
  ok('a thread with a picture shows it at the top of the list, both faces and the form');
}

// #111 · A POCKET'S OR AN ALWAYS TRUE'S EARLIER VERSION, IN ALTERATIONS, under the name the writer
// knows it by. The row's field is `pocket:<id>`, which is the code's and never shown.
{
  stubHistory = { entry: [
    { id: 'er-1', field: 'pocket:ad-9', label: 'Always true', previous_value: 'a ferryman, forty', replaced_at: 1, replaced_by: 'human' },
    { id: 'er-2', field: 'title', label: null, previous_value: 'Sereth', replaced_at: 1, replaced_by: 'human' }] };
  click({ panel: 'threads' });
  await sleep(30);
  click({ entry: 'e-1' });
  await sleep(30);
  click({ cardview: 'form' });
  click({ cardtab: 'more' });
  click({ fieldhistory: '1' });
  await sleep(30);
  const more = html('sideBody');
  assert.match(more, /<span class="kind">Always true<\/span>/, 'POCKET-SHOWN: the Always true is named as itself');
  assert.match(more, /a ferryman, forty/, '  with its old text');
  assert.ok(!more.includes('pocket:'), 'POCKET-SHOWN: and the code\'s name for it is not on the screen');
  assert.match(more, /<span class="kind">title<\/span>/, '  a field of the thread\'s own keeps its name');
  stubHistory = null;
  click({ fieldhistory: '1' });
  click({ cardview: null });
  click({ backentry: '1' });
  ok('Alterations names a pocket\'s earlier version as the writer knows it');
}

// #135 · TIMELINE AND PAST EDITS. "Over time" and "Earlier versions" read as the same list; the
// writer's words are Timeline (story time, sent to the model by scene) and Past edits (edit history,
// never sent). Only the words moved: `data-cardtab="time"` and `data-readgo="history"` still go there.
{
  stubHistory = { entry: [
    { id: 'er-1', field: 'title', label: null, previous_value: 'Sereth', replaced_at: 1, replaced_by: 'human' }] };
  const OLD = /over time|earlier version/i;
  // What a writer sees: the drawn HTML without its comments, which are the code's and never shown.
  const seen = () => (html('sideHead') + html('sideBody')).replace(/<!--[\s\S]*?-->/g, '');
  const drawn: string[] = [];
  click({ panel: 'threads' }); await sleep(30);
  click({ entry: 'e-1' }); await sleep(30);
  click({ readmenu: '1' });
  const menu = seen(); drawn.push(menu);
  assert.match(menu, /data-readgo="time" class="readrow">Timeline/, 'TIMELINE-MENU: the menu row is Timeline');
  assert.match(menu, /data-readgo="history" class="readrow">Past edits/, 'PASTEDITS-MENU: the menu row is Past edits');
  click({ readmenu: '1' });
  click({ readgo: 'time' }); await sleep(30);
  const time = seen(); drawn.push(time);
  assert.match(time, /data-cardtab="time" aria-pressed="true">Timeline</, 'TIMELINE-TAB: the old door opens the tab, named Timeline');
  click({ addstate: '1' }); await sleep(20); drawn.push(seen());
  click({ cardtab: 'more' }); drawn.push(seen());
  click({ readgo: 'history' }); await sleep(30);
  const more = seen(); drawn.push(more);
  assert.match(more, /data-fieldhistory="1">Hide past edits</, 'PASTEDITS-MORE: the old door opens Past edits');
  assert.match(more, /<div class="lbl sect">Past edits<\/div>/, '  under its name');
  for (const h of drawn) assert.doesNotMatch(h, OLD, 'NO-OLD-WORDS: no "Over time" or "Earlier versions" on screen');
  const { HELP } = await import('../web/help.js');
  assert.doesNotMatch(JSON.stringify(HELP), OLD, 'NO-OLD-WORDS: nor in the help cards');
  assert.strictEqual(HELP.states.title, 'Timeline', 'TIMELINE-HELP: the help card is Timeline');
  stubHistory = null;
  click({ fieldhistory: '1' });
  click({ cardview: null });
  click({ backentry: '1' });
  ok('Over time is Timeline and Earlier versions is Past edits, wherever a writer sees them, and the old doors still open them');
}

// ---- AND ON THE PAGE THAT SPANS THE SHELF, from that page's own data.
//
// The cross-story Threads page is one book's `V` away from the truth: it lists every book, so the
// stamp cannot come from `V.entryImages`. `GET /api/ledger` carries `imageAt` per row, keyed by BOTH
// ids — a followed thread has a picture in the book it lives in and not in the book following it.
{
  click({ leave: '1' });
  await sleep(40);
  // `canon` is the KEY; `threads` is only the glyph beside it in WNAV. And `loadLedger` is async and
  // paints when it lands, so the first read says "Reading the threads…" — waited for rather than
  // slept past, or this asserts a loading line.
  click({ nav: 'canon' });
  for (let i = 0; i < 40 && !/data-entry=/.test(html('page')); i++)
    await sleep(25);
  const page = html('page');
  assert.match(page, /Halsey/, 'the cross-story page is up');
  assert.match(page, /<img src="[^"]*story=s-1[^"]*entry=e-1/,
    'and a thread with a picture shows it, from this page\'s own imageAt rather than from V');
  assert.ok(!/<img src="[^"]*entry=e-2/.test(page), 'while one without shows no frame');
  ok('the cross-story Threads page shows a picture too, from its own data');
}
}

// #20 · STARTING A BOOK FROM THREADS YOU ALREADY HAVE, and the last place a point of view is
// picked without an example.
//
// checks.md: "the seed a story would be using threads from current stories in the users library to
// help seed or start a story without having to add them later. a jumping off point, or revisiting
// a location type of thing."
{
  const doc = (globalThis as any).document;
  click({ open: 's-1' });
  await sleep(40);
  click({ panel: 'story' });
  await sleep(30);
  // §1 · THE THIRD PLACE. Blank-create and spark step 2 had the example; editing an existing book
  // did not, and it is the one you come back to.
  assert.match(html('sideBody'), /She came up the stair and the rain came with her/,
    'the Story panel shows a line of prose for the point of view it is set to');

  click({ railview: 'workspace' });
  await sleep(30);
  click({ nav: 'create' });
  click({ blank: '1' });
  await sleep(40);
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
    await sleep(60);
    const made = POSTED.find((x) => String(x.url) === '/api/stories');
    assert.ok(made, `the story is created (${POSTED.map((x) => x.url).join(', ')})`);
    assert.strictEqual(made.body.premise, typed,
      'carrying what was typed before the picker was touched — the picker must not cost the form');

    // COPIES, NEVER LINKS. #113: the chosen thread rides the one create, named by the book it
    // actually lives in, so the server copies it inside the create's rollback (db.copyEntry, which
    // refuses unless BOTH books belong to the caller). Nothing is copied after the create, so a
    // failed copy cannot leave a half-made book.
    assert.deepStrictEqual(made.body.seed, [{ storyId: 's-1', entryId: 'e-1' }],
      'BLANK-SEED: the chosen thread rides the create, named by the book it lives in');
    assert.deepStrictEqual(POSTED.filter((x) => String(x.url).startsWith('/api/entry/copy')).map((x) => x.url), [],
      'BLANK-ONE: nothing is copied after the create');
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
  await sleep(30);
  click({ nav: 'stories' });
  for (let i = 0; i < 40 && !/model missing/.test(html('page')); i++) await sleep(25);
  const shelf = html('page');

  const card = (id: string) => {
    const at = shelf.indexOf(`data-open="${id}"`);
    return at < 0 ? '' : shelf.slice(at, shelf.indexOf('</button>', at));
  };
  assert.match(card('s-2'), /model missing/, 'the book pinned to a preset that is gone is marked');
  assert.match(card('s-2'), /write-nt-qwen36-h/, 'and the mark carries the id, which is what 400s');
  assert.doesNotMatch(card('s-3'), /model missing/, 'a book pinned to a model that IS served is not');
  assert.doesNotMatch(card('s-1'), /model missing/, 'and a book with no pin cannot be broken this way');
  assert.doesNotMatch(card('s-4'), /model missing/,
    "GUEST-PIN: nor a shared book pinned to a remote model on its owner's shortlist");
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

  // THE OWNER'S REMOTE PIN, seen by a guest. The guest's list lacks it; the book's own pin row is
  // what the server says writes it, and the shelf and the picker both read the list with it added.
  const { withPin } = await import('../web/model.js');
  const lent = { id: 'featherless:owner/Lent-Remote-24B', status: 'remote', source: 'remote', ready: true };
  assert.strictEqual(pinIsDead(lent.id, live), true, "the detector: alone, the guest's list calls it dead");
  assert.strictEqual(pinIsDead(lent.id, withPin(live, lent)), false, 'GUEST-PIN: with the pin row it is not');
  const opts = modelOptions(withPin(live, lent), lent.id);
  const picked = opts.find((o: any) => o.selected);
  assert.deepStrictEqual([picked?.value, picked?.gone, picked?.status], [lent.id, false, 'remote'],
    'GUEST-PIN: the picker selects the pin as a remote model, not as one the router dropped');
  assert.strictEqual(withPin(live, null), live, 'no pin row leaves the list as it was');
  assert.strictEqual(withPin([...live, lent], lent).length, live.length + 1, 'and a listed pin is not added twice');
}
ok('the shelf marks a book pinned to a model the router no longer serves');

// #18 §2 · THE HOUSE STYLE HAS A RE-ROLL, and it fills the box rather than saving it.
{
  const doc = (globalThis as any).document;
  click({ open: 's-1' });
  await sleep(40);
  click({ panel: 'story' });
  await sleep(30);
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
    await sleep(60);
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

// #18 §3 · THE STYLE LIBRARY, and the writer's default voice getting a surface at last.
//
// checks.md: "a new collection of voices or narraration styles that can be pulled from… so i dont
// have to copy and paste from somewhere else".
{
  const doc = (globalThis as any).document;
  click({ open: 's-1' });
  await sleep(40);
  // On Storyteller's Your voice tab since #131 (Account → Writing from 2026-10-27 until then).
  click({ panel: 'teller' }); click({ tellertab: 'voice' });
  for (let i = 0; i < 40 && !/data-mydefaultvoice/.test(html('sideBody')); i++) {
    await sleep(25);
  }
  const teller = html('sideBody');
  // THE DEFAULT VOICE HAD NO SURFACE AT ALL. Only the two spark buttons read it, while the server
  // quietly backfilled it into any book created with the voice box left blank — a page of text
  // nobody had seen, reaching the model, with nowhere to go and look at it.
  assert.match(teller, /data-mydefaultvoice/, 'the default voice has an editor');
  assert.match(teller, /The shipped voice\./, 'showing what a new book starts from today');
  assert.match(teller, /data-setvoice="1"/, 'and a way to make one yours');
  // A SAVED VOICE IS NOT A SIXTH MODE. `assemble` looks overrides up by mode name, so one that is
  // not a mode is invisible to it — and the editor must not draw it either.
  assert.doesNotMatch(teller, /data-editprompt="voice:Noir"/, 'and it is not listed as a mode');

  click({ tellertab: 'model' });
  click({ panel: 'story' });
  await sleep(30);
  const story = html('sideBody');
  assert.match(story, /data-applylib="voice:Noir"/, 'the saved voice is on the shelf beside the field');
  assert.match(story, /data-dellib="voice:Noir"/, 'with a way to forget it');
  assert.match(story, /data-savelib="voice"/, 'and a way to save what is in the box');
  assert.match(story, /data-savelib="style"/, 'the style field has its own shelf');
  assert.doesNotMatch(story, /data-applylib="style:/, 'which is empty, and separate from the voice one');

  // APPLYING COPIES INTO THE BOX AND SAVES IT, AND WHAT IT REPLACED CAN BE PUT BACK (ADR 0004 pass
  // three: there is no Save to press). Without the put-back, a library that saved on apply would
  // overwrite a page of hand-written voice with one press and no undo.
  const placed: string[] = [];
  const box: any = { value: 'typed by hand', dataset: { story: 'writingStyle' }, tagName: 'TEXTAREA',
    type: 'textarea', insertAdjacentHTML: (_: string, h: string) => placed.push(h) };
  const wasQS = doc.querySelector;
  doc.querySelector = (sel: string) => (sel === '[data-story="writingStyle"]' ? box : null);
  try {
    POSTED.length = 0;
    click({ applylib: 'voice:Noir' });
    await sleep(30);
    assert.strictEqual(box.value, 'Wet streets. Nobody explains themselves.', 'it copies in');
    const kept = POSTED.filter((x) => String(x.url) === '/api/story');
    assert.strictEqual(kept.length, 1, 'FILL-SAVED: and saves it, as typing would');
    assert.deepStrictEqual(kept[0].body.story, { writingStyle: 'Wet streets. Nobody explains themselves.' },
      'FILL-SAVED: that box alone');
    assert.match(placed.join(''), /data-putback="writingStyle"/, 'FILL-PUTBACK: with a press beside it that puts back what was there');
    POSTED.length = 0;
    click({ putback: 'writingStyle' });
    await sleep(30);
    assert.strictEqual(box.value, 'typed by hand', 'FILL-PUTBACK: the press puts the hand-written voice back');
    assert.strictEqual(POSTED.find((x) => String(x.url) === '/api/story')?.body.story.writingStyle, 'typed by hand',
      'FILL-PUTBACK: and saves it');
  } finally { doc.querySelector = wasQS; }

  // SAVING TAKES WHAT IS IN THE BOX, not what the story holds: the writer may have just edited it,
  // and saving the stored value would put something else on the shelf under the name they typed.
  const named: any = { value: 'Harbour' };
  const edited: any = { value: 'Short sentences. Weather in every scene.' };
  doc.querySelector = (sel: string) => (sel === '[data-libname="voice"]' ? named
    : sel === '[data-story="writingStyle"]' ? edited : null);
  try {
    POSTED.length = 0;
    click({ savelib: 'voice' });
    await sleep(40);
    const sent = POSTED.find((x) => String(x.url) === '/api/prompts');
    assert.ok(sent, 'it saves through the prompt route rather than a table of its own');
    assert.strictEqual(sent.body.key, 'voice:Harbour', 'namespaced by kind and name');
    assert.strictEqual(sent.body.text, 'Short sentences. Weather in every scene.',
      'carrying what is in the box, not what the story was loaded with');
  } finally { doc.querySelector = wasQS; }
}
ok('a voice can be saved to the library, pulled back into any book, and the default voice has a surface');

// FIRST RUN — the one screen where the model being asleep is likeliest and worst.
//
// This app is local, so day one is the day llama-server is most likely down, and the first press
// is the worst possible place to find that out. The line is CONDITIONAL, and a conditional that is
// only ever seen in one state is not a conditional: both branches are driven here, because the
// failure that matters is the screen telling a writer with a loaded model that it is asleep.
//
// Driven through the logo, which reloads the library — the only door in this harness that asks
// for /api/stories again after the first paint.
{
  const shelf = (over: any) => { shelfOverride = over; };
  try {
    // Nothing on the shelf, and the router down.
    shelf({ stories: [], model: null, slot: null, gen: STORY.gen, look: null });
    click({ home: '1' });
    await sleep(60);
    const cold = html('page');
    assert.match(cold, /Nothing in the library yet/, 'an empty shelf is the idea box, not a heading');
    assert.match(cold, /id="idea"/, 'and the box is on it, rather than a button that goes to find one');
    // The same id and the same action the create page uses, so there is one spark path and not two.
    assert.match(cold, /data-spark="1"/, 'the gold press sparks from here directly');
    assert.doesNotMatch(cold, /class="grid(?: [^"]*)?"|class="shelfgrid(?: [^"]*)?"|dashed/,
      'no empty grid and no dashed cells — there is nothing to put in them');
    assert.match(cold, /The model is asleep/, 'a sleeping router is said out loud before the first press');
    assert.match(cold, /Wake the model first/, 'with somewhere to go about it');

    // The same screen with the model up. THIS is the half that fails silently: a line printed
    // unconditionally passes every assertion above and lies to everyone whose model is running.
    shelf({ stories: [], model: 'Qwen3.6-WNTH-35B-A3B-NN', slot: SLOT, gen: STORY.gen, look: null });
    click({ home: '1' });
    await sleep(60);
    const warm = html('page');
    assert.match(warm, /Nothing in the library yet/, 'still the idea box');
    assert.doesNotMatch(warm, /The model is asleep/,
      'and it does not claim a loaded model is asleep');
    assert.doesNotMatch(warm, /Wake the model first/,
      'nor offer to wake something already awake');
    assert.match(warm, /Nothing here leaves the machine/, 'the local promise is made either way');
  } finally {
    shelfOverride = null;
    click({ home: '1' });
    await sleep(60);
  }
}
ok('a first run is the idea box, and says the model is asleep only when it is');


// ---- THE HERO BANNER ABOVE AN OPEN BOOK'S THREADS (2026-08-31).
// LAST IN THE FILE ON PURPOSE: it presses `lookall`, which is sticky, and two assertions above
// are about the page opening on ONE book. Run from the middle it broke both of them. Seth: "add a hero banner above
// the threads when the toggle is open", replacing a shelf of cards at the top he had removed —
// "the start a book here next to the titles is good enough."
//
// It is also the one place a world book is drawn with its own face, which is why the crash that hung
// this page belongs here now: storyCard assigned to a `const` for world books and threw, drawPage
// died inside loadLedger, and the page sat on "Reading the threads…" for ever.
{
  click({ leave: '1' });
  click({ railview: 'workspace' });
  await sleep(40);
  click({ nav: 'canon' });
  await sleep(60);
  // THE PAGE OPENS ON ONE BOOK — the one you were last writing in — so every other book has no
  // group at all until this. The first version of this test pressed a group that was not on the
  // page and read the word "World book" off the New-world-book row instead, which passed.
  click({ lookall: '1' });
  await sleep(40);
  const page = html('page');
  assert.doesNotMatch(page, /Reading the threads/,
    'the Threads page finishes loading — it hung here for ever when a world book threw');

  // The first group is open by default, and every other is a heading you press. The banner belongs
  // to the OPEN one, so a banner per book would be the failure this counts.
  const banners = page.match(/class="lbanner(?: [^"]*)?"/g) ?? [];
  assert.strictEqual(banners.length, 1,
    `one banner, on the book that is open — drew ${banners.length}`);

  // Open the world book's group and it wears its own tag rather than a writing status.
  click({ lbook: 's-5' });
  await sleep(40);
  // #books, not #page: opening a group repaints only that element.
  const opened = html('books');
  assert.match(opened, /class="lbanner(?: [^"]*)?"/, 'the world book gets a banner too');
  assert.match(opened, />World</, 'tagged as what it is, not as Writing');
  assert.match(opened, /Lore only/, 'and it says there is nothing written in it');

  /* ---- AND THE BOX AT THE TOP SEARCHES THE SAME WORDS THE STORY'S OWN LIST DOES (2026-09-11).
   *
   * It read title, body and keys — which in this library is title and keys plus a column the
   * 2026-08-29 migration emptied into the rooms. 23 of 483 cards still have a body. Both boxes go
   * through `threadText` now, so there is one answer to "what can a thread be found by" instead of
   * one per page, which is how they came to differ in the first place. */
  typeIn('lq', 'nobody balances');
  let found = html('books');
  assert.match(found, /Ambersand/,
    'a thread is found across books by words in a ROOM — where 464 of 483 cards keep their text');
  assert.ok(!/Halsey/.test(found), 'and a card that does not match is gone');

  typeIn('lq', 'What it holds');
  assert.match(html('books'), /Ambersand/, "and by the room's own name");

  typeIn('lq', 'good coat');
  found = html('books');
  assert.match(found, /Halsey/, 'the old fields still work — this widened the search, it did not move it');
  assert.ok(!/Ambersand/.test(found), 'and still narrows');

  // Title-only here too: `Halsey` appears in no body, no key and no room.
  typeIn('lq', 'Halsey');
  assert.match(html('books'), /Halsey/, 'and a card is still found by its name alone');

  typeIn('lq', 'usury');
  assert.match(html('books'), /Ambersand/,
    "and by a ROOM's own trigger word — a room fires on its own keys, not only the card's");

  typeIn('lq', '');
  assert.match(html('books'), /Halsey/, 'clearing it brings every book back');
  ok('the cross-book thread search reads the rooms too, through the same definition');

  // ---- AND IT PAINTS IN THE BOOK'S OWN COLOURS. Seth, 2026-09-03: "If a story has no image use
  // the Theme background" — the book's theme, not the app's, so a shelf of books with no covers
  // is not one column of identical grey.
  //
  // Read off THEMES rather than typed here: a literal would be a second copy of the palette, and
  // this check is that the BOOK'S theme reached the banner, not what sci-fi's accent is.
  const { THEMES: TH, themeVars: tv } = await import('../web/model.js');
  const cyber = tv('scifi');
  assert.ok(opened.includes(`--doc-wash:${cyber['--doc-wash']}`),
    "the banner is painted with the book's own theme, parsed out of the raw look column");
  assert.ok(opened.includes(`--gold:${TH.scifi.accent}`),
    'and the text tokens come with it, or a light theme would be unreadable on a dark app');

  // THE ABSENCE, which is the half that would pass for the wrong reason. A book with no look of
  // its own follows the writer, and the stylesheet already paints that — writing the writer's
  // tokens out would freeze them, so changing your theme would leave every banner behind.
  // THE ABSENCE, COUNTED AGAINST THE BANNERS ON SCREEN. A book with no look follows the writer and
  // the stylesheet already paints that; writing those tokens out would freeze them.
  // The first version sliced the second banner out and asserted no `--doc-wash` in it — the slice
  // came back EMPTY and passed against nothing. Two groups open, one book with a look: the two
  // counts ARE the assertion and neither can go vacuous.
  const drawn = (opened.match(/class="lbanner(?: [^"]*)?"/g) ?? []).length;
  const painted = (opened.match(/--doc-wash/g) ?? []).length;
  assert.strictEqual(drawn, 2, 'both groups are open, so there are two banners to tell apart');
  assert.strictEqual(painted, 1,
    'and only the book that has a look of its own carries inline colours');
  ok("a book's threads open under a hero banner, and a world book wears its own");
}

// ---- WHAT AUTOSAVES, AND WHAT STILL WAITS FOR SAVE (2026-08-31). Seth: "toggles and pickers are
// not autosaving."
//
// The story panel's checkboxes and selects did. Two kinds did NOT, and both are the word he used:
//
//   - a RANGE. `coverOpacity` is a [data-story] slider and the listener's guard admitted only
//     checkbox and SELECT, so it fell through. Its own hint said "Save to see it", which is how it
//     read as deliberate.
//   - the whole SAMPLER. Every [data-gen] control is a range and the panel had no autosave path at
//     all — Surprise, Focus and Passage length sat behind Storyteller's Save button.
//
// Driven through the real `change` listener rather than by calling commitStory, because the guard
// that dropped both of these IS the listener. `test/ui/panels.js` covers the same ground with a
// browser and a real tap; this is the half that runs with nothing installed.
{
  const changeIn = (target: any) => (listeners.change ?? []).forEach((f: Function) => f({ target }));
  const doc = (globalThis as any).document;
  const wasQSA = doc.querySelectorAll;
  // Both paths are gated on a book being open — `if (!S.storyId) return` — and the block before
  // this one leaves the app on Threads. Asserted rather than assumed: without this the whole
  // section passes for the wrong reason if the guard is ever what breaks.
  click({ open: 's-1' });
  await sleep(40);
  // The sampler reads the whole panel, so the fake has to BE a panel of sliders.
  const gens = [
    { dataset: { gen: 'temperature' }, type: 'range', value: '1.1' },
    { dataset: { gen: 'top_p' }, type: 'range', value: '0.9' },
    { dataset: { gen: 'target_words' }, type: 'range', value: '600' },
  ];
  doc.querySelectorAll = (sel: string) => (sel === '[data-gen]' ? gens : []) as any;
  try {
    POSTED.length = 0;
    changeIn(gens[0]);
    await sleep(30);
    const gen = POSTED.find((p: any) => String(p.url) === '/api/settings');
    assert.ok(gen, 'letting go of a sampler slider saves it with no Save pressed');
    // ALL THREE, because that is what the Save button always sent and what the route merges.
    assert.strictEqual(gen.body.temperature, 1.1, 'and it carries the slider that moved');
    assert.strictEqual(gen.body.target_words, 600, 'and the rest of the panel with it');
    // Numbers, not strings: `Number(el.value)` is the whole reason this is not a spread.
    assert.strictEqual(typeof gen.body.top_p, 'number', 'as numbers, not the strings a range gives');
    // AND THE PANEL KEEPS WHAT WAS SAVED (Seth, 2026-10-29: "the other sliders don't save"): the
    // Storyteller redraws its sliders from the saved values, so moving another one cannot send the
    // old ones back.
    click({ panel: 'teller' });
    await sleep(30);
    assert.match(html('sideBody'), /data-gen="temperature"[^>]*value="1\.1"/, 'GEN-KEPT: the Storyteller draws the saved Surprise');
    // NAMED FOR WHAT THE WRITER FEELS (Seth, 2026-10-31): not the old Surprise, Focus and Passage length.
    assert.deepStrictEqual([...html('sideBody').matchAll(/data-gen="(\w+)" aria-label="([^"]+)"/g)].map((m) => [m[1], m[2]]),
      [['temperature', 'How bold his words are'], ['top_p', 'How many words he weighs'], ['target_words', 'Longest a passage runs']],
      'GEN-NAMES: the three sliders carry the plain names');

    POSTED.length = 0;
    changeIn({ dataset: { story: 'coverOpacity' }, type: 'range', value: '55' });
    await sleep(30);
    const cov = POSTED.find((p: any) => String(p.url) === '/api/story');
    assert.ok(cov, 'and so does the cover slider on the story panel');
    assert.strictEqual(cov.body.story.coverOpacity, 55, 'as a number the column can clamp');

    // The two that already worked, asserted here so a future guard cannot drop them quietly.
    POSTED.length = 0;
    changeIn({ dataset: { story: 'lockoutOn' }, type: 'checkbox', checked: false });
    await sleep(30);
    const box = POSTED.find((p: any) => String(p.url) === '/api/story');
    assert.ok(box, 'a checkbox still saves itself');
    assert.strictEqual(box.body.story.lockoutOn, false,
      'and reads `checked`, not `value` — an unchecked box\'s value is the string "on"');

    POSTED.length = 0;
    changeIn({ dataset: { story: 'pov' }, tagName: 'SELECT', type: 'select-one', value: 'first' });
    await sleep(30);
    assert.ok(POSTED.find((p: any) => String(p.url) === '/api/story'), 'a picker still saves itself');

    // TYPED TEXT SAVES AS YOU GO (ADR 0004, pass three, 2026-10-29). Leaving a box saves it, and so
    // does a pause in the typing. Only the box that changed is sent: the rest of the panel may be
    // part-way through a sentence of its own.
    POSTED.length = 0;
    changeIn({ dataset: { story: 'premise' }, tagName: 'TEXTAREA', type: 'textarea', value: 'A ferry, a debt.' });
    await sleep(30);
    const left = POSTED.filter((p: any) => String(p.url) === '/api/story');
    assert.strictEqual(left.length, 1, 'TYPED-BLUR: leaving a typed box saves it with no Save pressed');
    assert.deepStrictEqual(left[0].body.story, { premise: 'A ferry, a debt.' }, 'TYPED-BLUR: and sends that box alone');

    POSTED.length = 0;
    const typing = { dataset: { story: 'genre' }, tagName: 'INPUT', type: 'text', value: 'Gothic Rom' };
    (listeners.input ?? []).forEach((f: Function) => f({ target: typing }));
    await sleep(100);
    assert.strictEqual(POSTED.filter((p: any) => String(p.url) === '/api/story').length, 0,
      'TYPED-PAUSE: nothing is sent while the fingers are still moving');
    typing.value = 'Gothic Romance';
    (listeners.input ?? []).forEach((f: Function) => f({ target: typing }));
    await sleep(1500);
    const paused = POSTED.filter((p: any) => String(p.url) === '/api/story');
    assert.strictEqual(paused.length, 1, 'TYPED-PAUSE: a pause in the typing saves it once');
    assert.strictEqual(paused[0].body.story.genre, 'Gothic Romance', 'TYPED-PAUSE: with what was typed last');
    // And leaving the box after the pause has nothing new to send.
    changeIn(typing);
    await sleep(30);
    assert.strictEqual(POSTED.filter((p: any) => String(p.url) === '/api/story').length, 1,
      'TYPED-ONCE: leaving a box already saved sends nothing again');

    // THE SCENE'S THREE BOXES, through the chapter route, one field at a time.
    POSTED.length = 0;
    changeIn({ dataset: { chapterTitle: '1' }, tagName: 'INPUT', type: 'text', value: 'The Crossing' });
    await sleep(30);
    const ch = POSTED.find((p: any) => String(p.url) === '/api/chapter');
    assert.ok(ch, 'TYPED-SCENE: leaving the scene name saves it');
    assert.deepStrictEqual(ch.body.chapter, { title: 'The Crossing' }, 'TYPED-SCENE: and only the name');
    POSTED.length = 0;
    changeIn({ dataset: { chapterNote: '1' }, tagName: 'TEXTAREA', type: 'textarea', value: 'She pays.' });
    await sleep(30);
    assert.deepStrictEqual(POSTED.find((p: any) => String(p.url) === '/api/chapter')?.body.chapter,
      { authorsNote: 'She pays.' }, 'TYPED-SCENE: Heads toward saves as authorsNote');
  } finally { doc.querySelectorAll = wasQSA; }
  ok('sliders, pickers and typed text all save themselves (ADR 0004)');
}

// ---- AND A CHECKBOX SHOWS ITS CONSEQUENCE WITHOUT A SAVE PRESS. They always saved; the autosave
// path skipped the repaint, so the control the checkbox GATES never appeared and the press read as
// needing Save.
//
// THE REDRAW IS MODELLED, NOT COUNTED. Counting sweeps for text boxes meant removing the restore
// loop removed a sweep, so the box was never blanked and the carry-across assertion passed with the
// code that loses it — it could only fail for the reason it was not asking about. `innerHTML` on
// #sideBody carries a setter instead: writing it is what a repaint DOES.
{
  const changeIn = (target: any) => (listeners.change ?? []).forEach((f: Function) => f({ target }));
  const doc = (globalThis as any).document;
  const wasQSA = doc.querySelectorAll;
  const sideBody = nodes.get('sideBody');
  const wasHtml = sideBody.innerHTML;
  click({ panel: 'story' });
  const box: any = { tagName: 'TEXTAREA', type: 'textarea', value: '',
    id: 'f-story-premise', getAttributeNames: () => [], getAttribute: () => null };
  doc.querySelectorAll = (sel: string) =>
    (String(sel).includes('#sideBody') ? [box] : []) as any;
  let raw = String(sideBody.innerHTML);
  Object.defineProperty(sideBody, 'innerHTML', {
    configurable: true,
    get: () => raw,
    // A repaint replaces the panel's markup with new elements. Whatever was typed into the old
    // ones is gone with them — which is the entire reason the no-repaint rule was written.
    set: (v: string) => { raw = v; box.value = ''; },
  });
  try {
    sideBody.innerHTML = 'STALE';
    box.value = 'half a premise';
    changeIn({ dataset: { story: 'chapterHero' }, type: 'checkbox', checked: true });
    await sleep(40);
    assert.notStrictEqual(html('sideBody'), 'STALE',
      'ticking a checkbox redraws the panel, with no Save pressed');
    assert.strictEqual(box.value, 'half a premise',
      'and the redraw does not eat what was half-typed beside it');

    // THE ABSENCE, which is the half that would pass for the wrong reason. A picker must NOT
    // redraw: `custom` spice is a UI mode with no stored value, so a redraw from V puts the picker
    // back on a level and takes away the box it had just revealed. That bug is recorded in
    // commitStory's own comment and this is what keeps it fixed.
    sideBody.innerHTML = 'STALE';
    changeIn({ dataset: { story: 'spice' }, tagName: 'SELECT', type: 'select-one', value: 'custom' });
    await sleep(40);
    assert.strictEqual(html('sideBody'), 'STALE',
      'and a picker still does not redraw the panel under the writer');
  } finally {
    doc.querySelectorAll = wasQSA;
    Object.defineProperty(sideBody, 'innerHTML',
      { configurable: true, writable: true, value: wasHtml });
  }
  ok('a checkbox redraws the panel it changed, and carries the half-typed text across');
}

// ---- WHEN A HEM'S PASSES DO NOT RUN, THE SCREEN SAYS SO (issue #32). Seth: "Facts are not being
// written based on the last chapter anymore."
//
// The passes run on every hem — summary, character memory, threads, finished threads, the next
// scene's suggestion — and each is wrapped server-side so a scene can still close with the model
// down. That wrapper was a bare `catch {}` returning null, so a writer got an empty queue and no
// reason. Since #89 the passes run after the end-scene route answers, and the report is stored on
// the scene's hem (`ch.hem.passes`); #92 reads it there, so it is the same after a reload.
//
// The EMPTY case is asserted first and it is the half that matters: a report drawn when nothing
// failed would be a permanent red box on a screen a writer sees after every scene.
{
  // #46. BEFORE ANY CLOSE NOTHING SAYS KEPT. A summary that is yours is only "kept" by a hem that
  // kept it; the closing report reads that off the hem, not off who wrote the summary.
  {
    const wasChapters = STORY.chapters, wasCurrent = STORY.currentChapter;
    STORY.chapters = STORY.chapters.map((c: any) => ({ ...c, summary: 'The envoy waits.',
      summaryAuthor: 'human' })) as any;
    // The report is about the chapter being written until one closes, and that is `currentChapter`.
    STORY.currentChapter = { ...STORY.currentChapter, summary: 'The envoy waits.', summaryAuthor: 'human' } as any;
    click({ open: 's-1' });
    await sleep(40);
    click({ panel: 'ritual' });
    await sleep(30);
    assert.doesNotMatch(html('sideBody'), /Kept your summary/i,
      'before a close, the closing report does not say it kept your summary');
    assert.match(html('sideBody'), /Your summary/, '  and it says the summary is yours');
    STORY.chapters = wasChapters; STORY.currentChapter = wasCurrent;
    click({ open: 's-1' });
    await sleep(40);
  }

  /** The tale as it is after Scene 2 was hemmed: Scene 2 closed and carrying its hem, and an empty
   *  Scene 3 being written. Opening the tale again is a reload, so the report is read from the data
   *  alone, and the door names no scene: the report is about the one before the empty one. */
  const wasChapters = STORY.chapters, wasCurrent = STORY.currentChapter;
  const reportOn = async (passes: any, o: { kept?: boolean, author?: string } = {}) => {
    STORY.chapters = [wasChapters[0], { ...wasChapters[1], status: 'closed', summary: 'The envoy waits.',
      summaryAuthor: o.author ?? 'model', hem: { state: 'done', startedAt: 1, finishedAt: 2, passes,
        keptSummary: !!o.kept, suggestion: null, outOfDate: false, overflow: [] } },
      { id: 'c-3', index: 3, title: 'Scene 3', summary: null, authorsNote: null, status: 'open',
        coversThrough: null, summaryStale: false, keepWhole: false, hem: null }] as any;
    STORY.currentChapter = { ...STORY.chapters[2] } as any;
    click({ open: 's-1' });
    await sleep(40);
    click({ ritual: '1' });
    await sleep(30);
    return html('sideBody');
  };
  const ran = { summary: null, memory: null, facts: null, finished: null, next: null };

  let side = await reportOn(ran);
  assert.match(side, /The Envoy &middot; hemmed/, 'the report is about the scene that was hemmed');
  assert.doesNotMatch(side, /did not run/, 'a hem where everything ran draws no failure report');

  // One pass down. The reason is the model's own words, so it has to be printed rather than
  // classified — "the model did not answer" and "nothing to read in this chapter" send a writer
  // to two different places.
  side = await reportOn({ ...ran, facts: 'the model did not answer' });
  assert.match(side, /New threads<\/span> did not run/, 'a failed pass is reported, named as the writer knows it (#77: not facts)');
  assert.match(side, /the model did not answer/, 'with the reason, verbatim');
  // NOT AS A LOST SCENE. The prose is committed before any pass runs, and a writer who reads this
  // box has to know that before they go looking for their words.
  assert.match(side, /Nothing was lost/, 'and says the scene itself closed');
  // The ones that ran are not listed. A report that names every pass every time is a report nobody
  // reads to the end.
  assert.doesNotMatch(side.match(/class="card hemfail">[\s\S]*?Nothing was lost/)?.[0] ?? '', /Changes to the people in it/, 'and a pass that ran is not in the list');
  assert.match(side, /data-hemagain="c-2" data-pass="facts"/, '  and that pass alone can be tried again');

  side = await reportOn({ summary: 'llama-server is not running', facts: 'llama-server is not running' });
  assert.match(side, /Summary<\/span> did not run/, 'two failures are both named');
  assert.match(side, /New threads<\/span> did not run/, 'both are named');

  // #46. A HEM THAT KEPT YOURS SAYS SO, and not as a pass that did not run. The hem reports it as
  // `keptSummary`; the summary line reads the author off the chapter, so a summary Anansi has since
  // written over is no longer called kept.
  side = await reportOn(ran, { kept: true, author: 'human' });
  assert.match(side, /Kept your summary/, 'a hem over yours says it kept your summary');
  assert.doesNotMatch(side, /did not run/, '  and not as a pass that did not run');
  click({ panel: 'setup' });
  await sleep(30);
  assert.match(html('sideBody'), /hemmed, kept your summary/, '  and the row for the scene that was hemmed says it');
  side = await reportOn(ran, { kept: true, author: 'model' });
  assert.doesNotMatch(side, /Kept your summary/,
    '  and once Anansi writes over it, the closing report stops saying kept');
  assert.match(side, /Summarised in/, "  and says Summarised");
  // A HEM THAT DID NOT KEEP IT does not say kept, even over a summary that is yours: the report says
  // what the hem did, and this one did not keep anything.
  side = await reportOn(ran, { kept: false, author: 'human' });
  assert.doesNotMatch(side, /Kept your summary/i,
    '  and a hem that did not keep it does not say kept, though the summary is yours');
  assert.match(side, /Your summary/, '  and it still says the summary is yours');
  STORY.chapters = wasChapters; STORY.currentChapter = wasCurrent;
  click({ open: 's-1' });
  await sleep(40);
  ok('the hem report says which of its passes did not run, and why, from the scene itself (#32, #92)');

  // ---- THE HEM IS ITS STEPS, ALWAYS, COLOUR CODED (Seth, 2026-10-30: "it should always show the
  // steps and what the ai is doing, color coded. If there's an actionable only then does the screen
  // below the steps change"). Anansi's six passes, then the writer's two, each in one state.
  {
    const states = (side: string) => [...side.matchAll(/data-hemstep="([a-z]+)" data-done="[01]"\s*data-state="([a-z]+)"/g)].map((m) => `${m[1]}:${m[2]}`);
    // IN THE ORDER IT HAPPENS (Seth, 2026-10-30): the next scene first, then the summary and the rest.
    const order = ['next', 'summary', 'tale', 'memory', 'facts', 'finished', 'decide', 'setup'];
    const below = (side: string) => side.match(/<div class="hemact">([\s\S]*?)<\/div>\s*<details class="hemmore/)?.[1] ?? 'NO HEMACT';
    click({ open: 's-1' }); await sleep(40);
    click({ ritual: '1' }); await sleep(30);
    let side = html('sideBody');
    // Who is in the next scene is a step only once there is a next scene, after the close.
    assert.deepStrictEqual(states(side), order.map((k) => `${k}:wait`), 'HEM-STEPS: before a hem, every step is shown, waiting, in order');
    assert.match(below(side), /class="btn fill" data-endchapter="1"/, 'HEM-ACT: and below them only the press that hems');
    assert.strictEqual((side.match(/class="btn fill"/g) ?? []).length, 1, 'HEM-GOLD: one gold press');
    assert.doesNotMatch(side, /data-panel="waiting"|passes did not run/, 'HEM-QUIET: no Decide button and no report box');
    side = await reportOn({ ...ran, tale: null, facts: 'the model did not answer' });
    assert.deepStrictEqual(states(side).map((x) => x.split(':')[0]),
      ['next', 'who', 'summary', 'tale', 'memory', 'facts', 'finished', 'decide', 'setup'],
      'HEM-ORDER: after a hem, the next scene and who is in it come first, then the summary, then the rest');
    assert.deepStrictEqual(states(side).filter((x) => !/^(who|decide|setup):/.test(x)).sort(),
      ['facts:fail', 'finished:done', 'memory:done', 'next:done', 'summary:done', 'tale:done'],
      'HEM-STATES: after a hem, the passes that ran are done and the one that did not failed');
    const step = (k: string) => side.match(new RegExp(`data-hemstep="${k}"[\\s\\S]*?</li>`))?.[0] ?? '';
    assert.match(step('facts'), /Did not run/, 'HEM-FAILED-STEP: the step that failed says it did not run');
    assert.doesNotMatch(step('facts'), /No new threads/, '  and not that it found nothing');
    assert.match(below(side), /data-hemagain="c-2" data-pass="facts"/, 'HEM-ACT-FAIL: its Try again is below the steps');
    assert.doesNotMatch(side, /Run a pass again/, 'HEM-ONE-RERUN: no block of re-run presses');
    assert.match(side, /<details class="hemmore[\s\S]*data-hemagain="c-2"(?! data-pass)[^>]*>Hem it again/, '  and the whole hem runs again from More');
    // WHO IS IN THE NEXT SCENE COMES FIRST (Seth, 2026-10-30: "once I press enter then I can remove or
    // add currently existing threads ... before it shows me the summary"): it is gold, with its list
    // and Done below the steps, and neither the summary nor the cards show until Done.
    assert.match(step('who'), /data-state="you"/, 'HEM-WHO: who is in the next scene is the gold step once how it starts is said');
    assert.match(below(side), /data-hemwhodone="c-2"/, '  with its Done below the steps');
    assert.doesNotMatch(below(side), /data-hemsumtext|data-deckkind=/, '  and no summary or cards yet');
    click({ hemwhodone: 'c-2' }); await sleep(30);
    side = html('sideBody');
    assert.match(below(side), /data-hemsumread="c-2"[^>]*>The envoy waits\./, 'HEM-SUMMARY-AFTER: after Done, with the scans over, the summary shows');
    // READ, WITH SKIP, EDIT AND USE (Seth, 2026-11-01: "The summary in step three of the hem can be
    // bigger with the same skip edit and use buttons"): the whole text to read, no box until Edit.
    assert.match(below(side), /data-hemsumskip="c-2"[\s\S]*data-hemsumedit="c-2"[\s\S]*data-hemsumuse="c-2"/,
      'HEM-SUM-BUTTONS: Skip, Edit and Use, as the drafts have');
    assert.doesNotMatch(below(side), /data-hemsumtext=/, '  and no box to type in until Edit');
    click({ hemsumedit: 'c-2' }); await sleep(30);
    assert.match(below(html('sideBody')), /<textarea class="field hemsumbox"[^>]*data-hemsumtext="c-2"[^>]*>The envoy waits\./, 'HEM-SUM-EDIT: Edit opens it in a big box');
    click({ hemsumdone: 'c-2' }); await sleep(30);
    assert.match(below(html('sideBody')), /data-hemsumread="c-2"/, '  and Done closes the box');
    click({ hemsumuse: 'c-2' }); await sleep(30);
    assert.match(below(html('sideBody')), /The summary: using it\./, 'HEM-SUM-USE: Use folds it');
    side = html('sideBody');
    // THE WRITER'S TURN IS GOLD: what it chalked waits on the writer, decided here on the hem's own card.
    assert.match(step('decide'), /data-state="you"/, 'HEM-YOU: deciding what it found is the gold step while things wait');
    assert.strictEqual((side.match(/data-state="you"/g) ?? []).length, 1, 'HEM-ONE-GOLD: one gold step, the next');
    assert.match(below(side), /data-deckkind="(hemthread|chalk)"/, 'HEM-DECIDE-HERE: and what it found is below the steps, to decide here');
    assert.doesNotMatch(below(side), /did not run &mdash; the model did not answer<\/span>\s*<button class="btn ghost" data-hemagain="c-2" data-pass="facts">Try again<\/button><\/div>\s*<\/div>\s*<div class="note/, '  without the card repeating the hem\'s state');
    side = await reportOn({ ...ran, tale: null, memory: 'model returned unparseable JSON' });
    assert.doesNotMatch(side, /unparseable JSON/, 'HEM-PLAIN: the raw error is not shown');
    assert.match(step('memory'), /Anansi&#39;s answer came back broken|Anansi's answer came back broken/, '  but what it means');
    STORY.chapters = wasChapters; STORY.currentChapter = wasCurrent;
    click({ open: 's-1' }); await sleep(40);
  }
  ok("the hem is its steps, colour coded, and below them only what needs the writer");

  // ---- DELETE-AFTER NAMES THE SUMMARIES OF YOURS IT WOULD CLEAR (#46). It clears the summary of
  // every chapter that loses a passage, and a summary that is yours is words the writer typed. The
  // first press is where they learn which ones. WHICH ones is the server's answer, read off the cut
  // the delete makes (test/scope.ts holds the two together); this is that the press asks it about
  // the passage pressed, and says what it was told.
  {
    // A target with a `style`, because `armed()` rings a button that has no label to swap.
    const press = (dataset: any) => (listeners.click ?? []).forEach((f: Function) => f({
      target: { closest: () => ({ dataset, querySelector: () => null, style: {}, disabled: false, textContent: '' }) },
    }));
    const said = () => String(nodes.get('toast').textContent);
    click({ open: 's-1' });
    await sleep(40);
    afterYours = [{ id: 'c-2', index: 2, title: 'The Envoy' }];
    press({ delafter: 'p-0' });
    await sleep(20);
    assert.strictEqual(afterAsked, 'p-0', 'the first press asks about the passage pressed');
    assert.match(said(), /clears your summary of The Envoy\./,
      'delete-after names the chapter whose summary of yours it clears');
    assert.doesNotMatch(said(), /Ashfall/, '  and not a chapter the server did not name');
    // Nothing of yours below the cut: it says only what it always said.
    afterYours = [];
    click({ open: 's-1' });
    await sleep(40);
    press({ delafter: 'p-1' });
    await sleep(20);
    assert.match(said(), /^Press again to delete every passage below this one\.$/,
      "  and with nothing of yours below the cut it says only what it always said");
    click({ open: 's-1' });
    await sleep(40);
    ok('delete-after names the chapters whose summary of yours it would clear');
  }

  // ---- AND IT LANDS ON THE CARDS THE CLOSE PROPOSED, not past them.
  //
  // Seth, 2026-09-01: *"the new cards landed in step 1 of the new chapter instead of on step 2 where
  // a uyser would be seeing it."* They did land on step one, which is where they belong — the order
  // is the argument and this panel's own note says so: what the chapter LEFT is decided before what
  // the next one is FOR. The defect was that the panel OPENED on step two regardless, so the cards
  // sat on a step you had to press backwards to reach. A gold count on the rail is not being shown
  // them.
  // A PROPOSAL AGAINST THE CHAPTER THAT CLOSED, which is what a debrief IS. The fixture's are all
  // against `c-2`, the open one — so without this the landing rule has nothing to fire on and the
  // assertion below would pass on the session state the close handler sets, which is the half that
  // does NOT survive a reload and therefore not the half worth testing.
  //
  // `changed` AND NOT `new`, because those go to two different steps now: a change writes into a
  // card you already have, which is What it left; a new thread is Anyone new. Both landings are
  // asserted below.
  STORY.proposals.push({ id: 'pr-old', entryId: 'e-1', title: 'Envoy Sereth',
    body: 'She has stopped waiting.', entryType: 'character', keys: [], kind: 'changed',
    delta: 'stopped waiting', chapterId: 'c-1' } as any);
  // #92. Hem this scene lands the writer in the new scene now, not on this panel; the panel opens
  // on the cards whenever it is opened while they are owed.
  click({ skipsetup: '1' });
  await sleep(20);
  click({ panel: 'setup' });
  await sleep(30);
  side = html('sideBody');
  assert.match(side, /data-setupstep="cards"/, 'the setup panel has a cards step');
  // THE STEP THAT IS LIT, not merely present. Read off the rail's own highlight, which is what a
  // writer sees, and asserted against the OTHER step too — a check for "cards is lit" would pass on
  // a panel that lit every step.
  const litStep = (html) => [...html.matchAll(/data-setupstep="([a-z]+)"([^>]*?)>/g)]
    .filter((m) => /rgba\(217,178,106,\.42\)/.test(m[2])).map((m) => m[1]);
  assert.deepStrictEqual(litStep(side), ['cards'],
    'a close that proposed cards must open on them, and on nothing else');
  assert.match(side, /What it left/, 'and the step says what it is');

  // OPENED BY HAND IS NOT THE SAME ARRIVAL, and that half is covered where it already was: the
  // block at "a chapter a writer has named must not have a name proposed over it" opens this panel
  // cold and reads the premise step's own markup. It is what caught the first version of this fix,
  // which keyed the landing step on `queue.length` alone — without a close the queue is everything
  // still pending, so a writer pressing the panel to name a chapter was dropped into a decision list
  // they did not come for. Not re-asserted here: `S.setupStep` is remembered between opens, so a
  // second check in this block would have to set the step it then reads.
  /* AND IT SURVIVES THE SESSION STATE GOING AWAY, which is the ACTUAL defect and the reason this
   * needed two attempts. The close handler set `S.setupStep = 'cards'` itself (before #92), so a
   * test that only closed a chapter passed on that — and says nothing about the state Seth was in, which is a
   * reload later with `S.setupStep` and `S.ritualOf` both gone.
   *
   * `skipsetup` clears `S.setupStep` (and only that), so it stands in for the reload exactly: the
   * next open has no remembered step and must fall back on the DATA. */
  click({ skipsetup: '1' });
  await sleep(20);
  click({ panel: 'setup' });
  await sleep(30);
  assert.deepStrictEqual(litStep(html('sideBody')), ['cards'],
    'with no remembered step and a proposal still open against a closed chapter, the panel opens on '
    + 'the cards — this is the half a reload used to lose');

  /* AND A NEW THREAD FROM THAT SAME CLOSE LANDS ON ANYONE NEW, not on What it left. Seth,
   * 2026-09-01: "the new cards that are suggested are still landing under what is left instead of
   * anyone new panel." The step names were already the split and the queue ignored them. */
  STORY.proposals = STORY.proposals.filter((p: any) => p.id !== 'pr-old');
  STORY.proposals.push({ id: 'pr-new', entryId: null, title: 'The ferryman',
    body: 'He takes coin from one hand only.', entryType: 'lore', keys: [], kind: 'new',
    delta: 'New face.', chapterId: 'c-1' } as any);
  click({ skipsetup: '1' });
  await sleep(20);
  click({ panel: 'setup' });
  await sleep(30);
  assert.deepStrictEqual(litStep(html('sideBody')), ['more'],
    'a close that proposed only NEW threads opens on Anyone new, where they now live');
  const anyoneNew = html('sideBody');
  assert.match(anyoneNew, /The ferryman/, 'and the card is on that step');
  assert.match(anyoneNew, /data-invent=/, 'beside the tray that asks for another — the same thing');
  // THE PREFILLED BOX SAYS WHAT IT IS (usability walkthrough, 2026-10-30): with no label, the scene's
  // Heads toward sitting under the kind chips read as typing that had gone into the wrong field.
  assert.match(anyoneNew, /<label[^>]*for="f-invdir"[^>]*>What Anansi writes them from</,
    'SETUP-STEER-LABEL: the box on Anyone new has a label saying what it is for');
  assert.match(anyoneNew, /<textarea[^>]*id="f-invdir"/, '  and the label belongs to that box');
  assert.match(anyoneNew, /starts from where the scene heads/, '  and a hint says why it is already filled');

  /* AND THE TWO KINDS DO NOT BLEED, which needs BOTH present at once: with only new threads the
   * panel redirects off the empty cards step, so "the ferryman is not on the cards step" was true
   * for the wrong reason and would have passed on no split at all. */
  STORY.proposals.push({ id: 'pr-old', entryId: 'e-1', title: 'Envoy Sereth',
    body: 'She has stopped waiting.', entryType: 'character', keys: [], kind: 'changed',
    delta: 'stopped waiting', chapterId: 'c-1' } as any);
  click({ setupstep: 'cards' });
  await sleep(30);
  const whatLeft = html('sideBody');
  assert.deepStrictEqual(litStep(whatLeft), ['cards'], 'the cards step is reachable with a change on it');
  assert.match(whatLeft, /stopped waiting/, 'and holds what the chapter changed');
  assert.doesNotMatch(whatLeft, /The ferryman/,
    'a new thread must not also sit under What it left — that step is what changed');
  // The count on the rail is per step, so each says what IT owes rather than the whole queue.
  assert.match(whatLeft, /1 &middot; What it left <span[^>]*>1</, 'one change owed on step one');
  // THREE: the ferryman from the close, and the fixture's two new threads chalked against the scene
  // being set up (pr-1, pr-5), which is where Have Anansi write someone chalks (Seth, 2026-10-30: "any
  // new threads anansi makes isn't shown to me"). The string chalked there (pr-2) is not a thread.
  assert.match(whatLeft, /3 &middot; Anyone new <span[^>]*>3</, 'and three new threads on step three');
  click({ setupstep: 'more' }); await sleep(30);
  assert.match(html('sideBody'), /The lamplighter/, 'SETUP-ASKED-HERE: a new thread chalked against this scene is on Anyone new');
  assert.doesNotMatch(html('sideBody'), /The debt nobody has called in/, '  and a string is not');
  click({ setupstep: 'cards' }); await sleep(30);

  click({ setupstep: 'more' });
  await sleep(30);
  assert.doesNotMatch(html('sideBody'), /stopped waiting/,
    'and a change must not sit under Anyone new either');
  STORY.proposals = STORY.proposals.filter((p: any) => !['pr-new', 'pr-old'].includes(p.id));
  click({ skipsetup: '1' });
  await sleep(20);
  click({ panel: 'setup' });
  await sleep(30);
  assert.deepStrictEqual(litStep(html('sideBody')), ['premise'],
    'and with nothing owed from a closed chapter it opens on the next chapter');
  /* ANYONE NEW IS THE ACCENTED PRESS ON THE BEAT STEP, AND IT IS FIRST. Seth, 2026-09-01: "make the
   * anyone new button the accented one and move it to the top above save and write."
   *
   * Asserted as an ORDER and as an exclusive accent, not as "the button exists": it was already
   * there, below Start writing (Save and write until 2026-10-30), wearing the ghost style. A check for
   * its presence was green throughout. */
  click({ setupstep: 'premise' });
  await sleep(30);
  const beat = html('sideBody');
  const at = (re) => beat.search(re);
  const anyone = at(/<button class="btn(?! ghost)(?: [^"]*)?" data-setupstep="more"/);
  const saveWrite = at(/data-savesetup="1"/);
  assert.ok(anyone > -1, 'Anyone new is the accented button — class "btn", not "btn ghost"');
  assert.ok(saveWrite > -1, 'and Start writing is still there');
  assert.match(beat, /data-savesetup="1">Start writing</, 'START-WRITING: the way out of the setup says Start writing');
  assert.doesNotMatch(beat, /Save and write/, '  and not Save and write');
  assert.ok(anyone < saveWrite, 'with Anyone new above it');
  assert.match(beat, /<button class="btn ghost(?: [^"]*)?" data-savesetup="1"/,
    'Start writing gives up the accent — one accent per screen, and it is the way out rather than '
    + 'the way through');
  /* AND A QUEUE FROM FURTHER BACK IS NOT A DEBRIEF. The fallback is the chapter BEFORE this one and
   * only that one: a writer on chapter three with undecided cards from chapter one should not be
   * dropped into that debrief every time they open this panel cold. A queue ignored for two chapters
   * is what Waiting is for.
   *
   * Needs THREE chapters to be visible at all — with two, "the previous chapter" and "any other
   * chapter" are the same chapter, and a rule that accepted either passed every check above. Both
   * the list and the pointer are restored, so nothing after this block sees the third. */
  {
    const wasChapters = STORY.chapters, wasCurrent = STORY.currentChapter;
    const wasProps = STORY.proposals;
    const c3 = { id: 'c-3', index: 3, title: 'The Writ', summary: null, authorsNote: null,
                 status: 'open', coversThrough: null, summaryStale: false, keepWhole: false };
    STORY.chapters = [...wasChapters, c3] as any;
    STORY.currentChapter = c3 as any;
    // ONLY THE FAR ONE. The fixture's own proposals are all on c-2, which IS the chapter before c-3
    // — so leaving them in makes c-2 a real debrief and the panel is right to open on it. That is
    // what the first version of this asserted against, and the code was correct.
    STORY.proposals = [{ id: 'pr-far', entryId: 'e-1', title: 'Envoy Sereth',
      body: 'Two chapters ago.', entryType: 'character', keys: [], kind: 'changed',
      delta: 'old news', chapterId: 'c-1' }] as any;
    // `ritual` CLEARS `S.ritualOf` — the one action that does — so this is the cold load the data
    // fallback exists for. Without it the pointer from the close above still names c-2 and wins,
    // correctly, and the fallback under test is never reached.
    click({ ritual: '1' });
    await sleep(20);
    click({ skipsetup: '1' });
    await sleep(20);
    click({ panel: 'setup' });
    await sleep(30);
    assert.deepStrictEqual(litStep(html('sideBody')), ['premise'],
      'a queue from two chapters back is not a debrief — it opens on the next chapter');
    assert.doesNotMatch(html('sideBody'), /Two chapters ago/, 'and does not draw it');
    STORY.proposals = wasProps;
    STORY.chapters = wasChapters; STORY.currentChapter = wasCurrent;
  }
  ok('a close lands the writer on the cards it proposed, a reload still does, and Anyone new leads');
}

// ---- NO WHOLE-PANEL SAVE (ADR 0004, pass three, 2026-10-29). Tale, This scene and Storyteller each
// had a Save pinned to their top (#33). Every field on them saves itself now (the block on what
// autosaves drives that), so a Save there would be a button that does nothing new.
{
  for (const [panel, label] of [['story', 'Tale'], ['chapter', 'This scene'], ['teller', 'Storyteller']]) {
    click({ panel });
    await sleep(40);
    const body = html('sideBody');
    assert.doesNotMatch(body, /data-save(story|gen)="1"/, `NO-SAVEBAR: the ${label} panel has no whole-panel Save`);
    assert.doesNotMatch(body, /class="savebar"/, `NO-SAVEBAR: and no empty bar where it was`);
  }
  ok('Tale, This scene and Storyteller have no Save: their fields save themselves');
}

// ---- THE CHAPTER PANEL SPLITS INTO FOUR, on the mechanism the Story panel already uses.
//
// Seth, 2026-09-03: "everything here should also use the tab system to split information." It was
// one column doing five jobs — naming the chapter, the proposals queue, the summaries that stand in
// for earlier chapters, the acts they collapse into, and the branches — with the queue four screens
// down.
//
// THE STYLESHEET IS THE MECHANISM, so it is asserted and not assumed. `.sgroup` is `display:none`
// and a group only comes back for a `[data-tab]` that names it — so a group added to the markup and
// forgotten in app.html is a tab that opens on nothing at all, silently, with no error anywhere. A
// check that only read the markup would pass for all four while three of them were blank.
{
  const { readFileSync } = await import('node:fs');
  const sheet = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
  click({ panel: 'chapter' });
  await sleep(40);
  const body = html('sideBody');

  const GROUPS = ['this', 'proposed', 'summaries', 'branches'];
  assert.match(body, /data-tab="this"/, 'the panel opens on the chapter itself');
  for (const g of GROUPS) {
    assert.ok(body.includes(`data-group="${g}"`), `the chapter panel draws its ${g} group`);
    assert.match(sheet, new RegExp(`\\[data-tab="${g}"\\]\\s*>\\s*\\.sgroup\\[data-group="${g}"\\]`),
      `and app.html brings the ${g} group back — without its rule that tab opens on nothing`);
  }
  assert.strictEqual((body.match(/class="sgroup(?: [^"]*)?"/g) ?? []).length, GROUPS.length,
    'four groups and no more — a fifth would be drawn and unreachable');
  assert.strictEqual((body.match(/data-chaptab="/g) ?? []).length, GROUPS.length,
    'and one chip per group, or a group has no door');

  // AND EVERY CHIP SAYS HOW MUCH IS BEHIND IT. A tab hides its contents by design, so a group with
  // no count is a group nobody opens — this harness itself walked past Summaries and Branches until
  // the browser pass made it press them, which is exactly the blindness a writer has.
  // Zero is drawn as NOTHING, not as 0: "Summaries" is a place you can go, "Summaries 0" reads as a
  // counter that broke. The fixture has summaries, so the count must be there.
  const chip = (k: string) => body.match(new RegExp(`data-chaptab="${k}"[\\s\\S]{0,240}?</button>`))?.[0] ?? '';
  assert.match(chip('summaries'), /class="tnum(?: [^"]*)?"/, 'Summaries says how many it holds');
  assert.match(chip('proposed'), /class="tnum(?: [^"]*)?"/, 'and so does Proposed');
  assert.doesNotMatch(chip('this'), /class="tnum(?: [^"]*)?"/,
    'This chapter counts nothing — a count there would be a number with no referent');

  // ONE COLUMN CUT INTO FOUR BY HAND, so the nesting is counted rather than eyeballed. An unclosed
  // group swallows the ones after it and the panel still renders.
  const opened = (body.match(/<div\b/g) ?? []).length;
  const closed = (body.match(/<\/div>/g) ?? []).length;
  assert.strictEqual(opened, closed,
    `the chapter panel's divs balance — ${opened} opened, ${closed} closed`);
  ok('the Chapter panel splits into four groups the stylesheet can actually show');
}

// ---- WHAT A CONTROL DOES, FOLDED AWAY UNTIL IT IS ASKED FOR.
//
// THE PAIRING IS THE CHECK THAT MATTERS, asserted against the SOURCE. `tipCard(k)` writes `hidden`
// unless `S.tips[k]` is set and `tipMark(k)` is the only thing that sets it — so a card with no
// mark is a sentence removed from the app with no way back, rendering perfectly and breaking
// nothing. That happened once here (`sOpacity`). The reverse is only clutter.
// Webs pass their slug as a VARIABLE, so they are not counted: they have their own check above.
{
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  const keys = (fn: string) => new Set([
    ...[...src.matchAll(new RegExp(`${fn}\\(\\s*['\`]([^'\`]+)['\`]`, 'g'))].map((m) => m[1]),
    // The generated story fields build their key from the field name, so the literal in the source
    // is a template. Counted as one on both sides, which is what it is.
    ...[...src.matchAll(new RegExp(`${fn}\\(\`([^\`]*\\$\\{[^\`]*)\``, 'g'))].map((m) => m[1]),
  ]);
  // BOTH SPELLINGS COUNT. A web is a mark too — `helpMark('states')` names its slug literally and
  // draws the same button — and one control now pairs `helpMark` with a hand-built `tipCard` so its
  // web and its own sentence live in ONE card rather than two stacked boxes. Counting only the
  // `tip*` pair reported that card as orphaned, which is the check being narrow rather than the app
  // being wrong; counting both spellings is what makes the invariant true of the app as written.
  const marks = new Set([...keys('tipMark'), ...keys('helpMark')]);
  const bodies = new Set([...keys('tipCard'), ...keys('helpBody')]);
  assert.ok(marks.size >= 25, `the sweep landed — ${marks.size} folded explanations`);
  assert.deepStrictEqual([...bodies].filter((k) => !marks.has(k)), [],
    'every folded sentence has a mark that opens it, or it is hidden from everyone for ever');
  assert.deepStrictEqual([...marks].filter((k) => !bodies.has(k)), [],
    'and every mark opens something, or it is a button that does nothing');

  // THE CARD MUST ACTUALLY FOLD, and it must not be a `.card`. Two separate lessons on one class.
  //
  // FOLD: `display:flex` is more specific than the UA sheet's `[hidden]{display:none}`, so without
  // a rule of its own every explanation ships permanently open and every mark does nothing.
  // app.html records that trap for `.pane` and it was walked into anyway.
  //
  // AND NOT A `.card`: a card in this app is CONTENT — a thread, a proposal, a summary — and
  // `#sideBody .card` is how several places reach for one. Wearing that class put a dozen hidden
  // decoys in the list, and test/ui/panels.js began clicking an explanation instead of a thread.
  // Only the browser pass could see that, which is the argument for running it.
  const sheet = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
  assert.match(sheet, /\.tipcard\[hidden\]\s*\{[^}]*display:\s*none/,
    '.tipcard[hidden] must be stated, or the folds never close');
  assert.doesNotMatch(html('sideBody'), /class="card"[^>]*id="tip-/,
    'an explanation must not wear the class the app uses for content');

  // AND IT STARTS SHUT, ON THE PANEL, which is the half the source cannot answer.
  click({ panel: 'story' });
  await sleep(40);
  let body = html('sideBody');
  assert.match(body, /data-tip="sCover"/, 'the Story panel draws its marks');
  assert.match(body, /id="tip-sCover" hidden/, 'and the explanation behind one starts folded away');

  /* ---- ONE MARK PER LABEL. Seth, 2026-09-03: "voice of the weave now has two."
   *
   * It did. That field has a curated web AND a sentence of its own, and the first sweep gave a mark
   * to every field with a sentence without noticing one of them already had one — two marks in two
   * styles, side by side, opening two boxes about the same box below them.
   *
   * COUNTED INSIDE THE LABEL, because that is where the bug was visible: both marks rendered, both
   * worked, and nothing was broken except the reading. */
  const lbl = body.match(/<label class="lbl(?: [^"]*)?" for="f-story-writingStyle">[\s\S]*?<\/label>/)?.[0] ?? '';
  assert.ok(lbl, 'the voice field draws a label');
  assert.strictEqual((lbl.match(/data-tip=/g) ?? []).length, 1,
    'Voice of the weave carries one mark, not one per source of explanation');

  // ABOVE IS ASSERTED AS A POSITION, not by a regex reaching from the card to a `<textarea`. The
  // first version did exactly that and passed with the card moved back UNDER the box — because the
  // match simply ran on to the NEXT field's textarea. Breaking the code on purpose is what showed
  // it; the two indices cannot lie the same way.
  const cardAt = body.indexOf('id="tip-sf-writingStyle"');
  const boxAt = body.indexOf('<textarea class="field" id="f-story-writingStyle"');
  assert.ok(cardAt > -1, 'the voice field has a card');
  assert.ok(boxAt > -1, 'and a box to explain');
  assert.ok(cardAt < boxAt,
    'the card is drawn ABOVE the box — an explanation read after you fill it in is read too late');

  // AND NEITHER EXPLANATION WAS DROPPED TO GET THERE. The web says what a voice IS; the field's own
  // sentence says what happens if you leave the box empty. They are complementary, so the fix was
  // to put both in one card — a fix that quietly deleted one would pass the count above.
  const card = body.slice(cardAt, boxAt);
  assert.match(card, /How the prose sounds/, 'and it still carries the web');
  assert.match(card, /How the narration behaves/, "and the field's own sentence with it");

  // OPENING ONE DOES NOT REPAINT. Every field on this panel saves after a pause in the typing,
  // so a paint inside the pause eats a half-written premise — the bug this file records eight times, and the
  // one `data-help` still has. The sentinel is the only thing that can tell a repaint from a
  // correct redraw, because both leave the markup looking right.
  nodes.get('sideBody').innerHTML = 'STALE';
  click({ tip: 'sCover' });
  await sleep(30);
  assert.strictEqual(html('sideBody'), 'STALE',
    'opening an explanation does not repaint the panel under the writer');

  // ...and the state survives the next repaint that DOES happen, or a checkbox would shut it.
  click({ panel: 'story' });
  await sleep(40);
  body = html('sideBody');
  assert.match(body, /id="tip-sCover"(?! hidden)/,
    'and it is still open after an unrelated repaint');
  click({ tip: 'sCover' });
  click({ panel: 'story' });
  await sleep(40);
  assert.match(html('sideBody'), /id="tip-sCover" hidden/, 'pressing it again folds it back');

  /* ---- A WEB DRAWN ON TWO SCREENS OPENS ON BOTH. `persona` and `locked` are on the Story panel
   * and in the wizard, so two elements legitimately carry one key. Folding the webs into this
   * mechanism gave those bodies an `id`, and `getElementById` returns whichever comes FIRST in the
   * document — the side panel's, open or not. The copy the writer was looking at stayed shut and
   * the mark read as dead. Counted, because one match is exactly what the bug looked like. */
  const opened: string[] = [];
  const wasQS = (globalThis as any).document.querySelectorAll;
  (globalThis as any).document.querySelectorAll = (sel: string) => {
    if (!String(sel).startsWith('[id="tip-')) return wasQS(sel);
    // Two elements, the way two screens really do carry one web.
    return [{ hidden: true }, { hidden: true }].map((el, i) =>
      new Proxy(el, { set: (t, k, v) => (k === 'hidden' && v === false && opened.push(`${i}`), Reflect.set(t, k, v)) }));
  };
  try {
    click({ tip: 'persona' });
    assert.deepStrictEqual(opened, ['0', '1'],
      'both copies of a web open — the first-match version left the visible one shut');
  } finally { (globalThis as any).document.querySelectorAll = wasQS; }
  ok('what a control does is folded behind a mark, on all three panels, and every mark opens something');
}

// ---- A TAP REWEAVES, A HOLD OPENS THE BOX (Seth, 2026-10-29: "the button just reweaves; holding the
// reweave button opens what we just built"). This replaces #38's rule that a directed passage opened
// its instruction on the press (Seth, 2026-09-01: "I should be able to edit the regenerate command"):
// the instruction is still editable, behind a hold, or Alt+click at a desk.
//
// The tap is asserted on a DIRECTED passage, because that is the one whose press used to open the box
// and generate nothing: the half that would pass for the wrong reason on an undirected one.
{
  const wait = (ms = 40) => sleep(ms);
  const gens = () => POSTED.filter((x: any) => String(x.url).startsWith('/api/generate'));
  click({ open: 's-1' }); await wait();

  // A TAP, directed passage: no box, and the reweave goes at once with the passage's own instruction.
  POSTED.length = 0;
  click({ re: 'p-1' }); await wait(200);
  assert.doesNotMatch(html('col'), /data-rerollbox/, 'a tap opens no box, even on a directed passage');
  assert.strictEqual(gens().length, 1, 'a tap reweaves at once');
  assert.strictEqual(gens()[0].body.regenerateOf, 'p-1', 'that passage');
  assert.ok(!('directive' in gens()[0].body) && !('whatFailed' in gens()[0].body),
    'with no directive and no note: the server inherits the passage\'s own instruction');
  // And an undirected one, the same.
  POSTED.length = 0;
  click({ re: 'p-2' }); await wait(200);
  assert.doesNotMatch(html('col'), /data-rerollbox/, 'an undirected passage opens no box either');
  assert.strictEqual(gens()[0]?.body.regenerateOf, 'p-2', 'and reweaves at once');

  // A HOLD opens the box and generates nothing, and the click the lift leaves behind is not a tap.
  POSTED.length = 0;
  await holdRe('p-1');
  const doc = html('col');
  assert.match(doc, /data-rerollbox/, 'a hold opens the box');
  assert.match(doc, /have the envoy arrive early/, 'prefilled with the instruction that made it');
  assert.match(doc, /data-rerollgo="p-1"/, 'with a Reweave button naming that passage');
  assert.match(doc, /data-rerollx/, 'and a way out that changes nothing');
  assert.strictEqual(gens().length, 0, 'and the hold, and the click after it, generate NOTHING');

  // Cancel leaves the passage alone.
  click({ rerollx: '1' }); await wait();
  assert.doesNotMatch(html('col'), /data-rerollbox/, 'Cancel closes it');
  assert.strictEqual(gens().length, 0, 'and Cancel generates nothing either');

  // ALT+CLICK is the hold at a desk.
  altClick({ re: 'p-1' }); await wait();
  assert.match(html('col'), /data-rerollbox/, 'Alt+click opens the box too');
  assert.strictEqual(gens().length, 0, 'and generates nothing');
  click({ rerollx: '1' }); await wait();
  ok('a tap on Reweave reweaves at once, and a hold or Alt+click opens the box');
}

// ---- THE REWEAVE BOX HAS TWO FIELDS (Seth, 2026-10-29: "reweave needs two fields: original
// instruction and what didn't work about the last one"). The instruction, prefilled and editable as
// before, and What didn't work, empty. Both are drawn from S, so a repaint keeps what was typed, and
// the press sends both: the instruction as the directive, the note as `whatFailed`.
{
  const wait = () => sleep(40);
  const box = (attr: string) => html('col').match(new RegExp(`<textarea[^>]*${attr}[^>]*>([^<]*)</textarea>`));
  const type = (attr: string, value: string) => (listeners.input ?? []).forEach((f: Function) => f({
    target: { matches: (s: string) => s === `[${attr}]`, dataset: {}, value } }));
  const sentNow = () => POSTED.find((x: any) => String(x.url).startsWith('/api/generate'))?.body;
  click({ open: 's-1' }); await wait();
  await holdRe('p-1');
  assert.ok(box('data-rerollbox'), 'the box has the instruction field');
  assert.match(box('data-rerollbox')![1], /have the envoy arrive early/, 'prefilled with the instruction that made it');
  assert.ok(box('data-rerollwhy'), "and a What didn't work field");
  assert.strictEqual(box('data-rerollwhy')![1], '', 'which starts empty');
  assert.match(html('col'), /What didn&#39;t work|What didn't work/, 'and is named for what it is');
  assert.doesNotMatch(html('col'), /shown the\s+passage you have now/, 'and the box does not say the passage is shown to Anansi');

  type('data-rerollbox', 'have the envoy arrive late');
  type('data-rerollwhy', 'The envoy was too friendly.');
  click({ readmode: '0' }); await wait();   // a repaint of the column and nothing else
  assert.match(box('data-rerollbox')?.[1] ?? '', /have the envoy arrive late/, 'the edited instruction survives a repaint');
  assert.match(box('data-rerollwhy')?.[1] ?? '', /The envoy was too friendly\./, 'and so does the note');

  POSTED.length = 0;
  click({ rerollgo: 'p-1' }); await sleep(200);
  const sent = POSTED.find((x: any) => String(x.url).startsWith('/api/generate'))?.body;
  assert.ok(sent, 'the press sends a reweave');
  assert.strictEqual(sent.regenerateOf, 'p-1', 'of that passage');
  assert.strictEqual(sent.directive, 'have the envoy arrive late', 'with the instruction as edited');
  assert.strictEqual(sent.whatFailed, 'The envoy was too friendly.', 'and what did not work');

  // EMPTY SENDS NOTHING FOR IT. Opened again, the note is empty again and the press leaves it out.
  await holdRe('p-1');
  assert.strictEqual(box('data-rerollwhy')?.[1], '', 'a new box starts with an empty note');
  POSTED.length = 0;
  click({ rerollgo: 'p-1' }); await sleep(200);
  const bare = sentNow();
  assert.ok(bare && !('whatFailed' in bare), 'with the note empty, the press sends no whatFailed');

  // A PASSAGE WITH NO DIRECTIVE opens the box too, with The instruction EMPTY (Seth, 2026-10-29:
  // "the Reweave while you're actually writing should hold the original reweave or direction prompt
  // that was used"). It is not prefilled with the mode's own wording, and there is no hint saying it
  // was. Empty means the passage's own mode instruction runs, as a tap: no directive is sent.
  // p-2 is a Speak passage; the canned Speak instruction is "Say it.", which must not appear.
  await holdRe('p-2');
  assert.strictEqual(box('data-rerollbox')?.[1], '', "an undirected passage's box opens with The instruction empty");
  assert.doesNotMatch(html('col'), /Say it\.|own Speak instruction|had no instruction of its own/i,
    "with no mode wording in it and no hint about one");
  type('data-rerollwhy', 'Too polite.');
  POSTED.length = 0;
  click({ rerollgo: 'p-2' }); await sleep(200);
  const own = sentNow();
  assert.ok(own, 'empty, the press still reweaves');
  assert.ok(!('directive' in own) && !('mode' in own && own.mode === 'direct'),
    'and sends no directive, so the server runs the passage\'s own instruction');
  assert.strictEqual(own?.whatFailed, 'Too polite.', 'and the note still goes');
  // TYPED, it is sent: a direction written into the empty field is the directive.
  await holdRe('p-2');
  type('data-rerollbox', 'have the guard answer instead');
  POSTED.length = 0;
  click({ rerollgo: 'p-2' }); await sleep(200);
  assert.strictEqual(sentNow()?.directive, 'have the guard answer instead', 'a direction typed into it is sent as the directive');
  assert.ok(!('whatFailed' in (sentNow() ?? {})), 'and no note when none was written');

  // THE WRITER'S OWN PASSAGE. A tap on it asks twice; the box's Reweave is already the second,
  // deliberate press, so it goes at once with what is in the box rather than asking for a tap that
  // would reweave without it. p-5 is the writer's.
  await holdRe('p-5');
  type('data-rerollwhy', 'Wrong voice.');
  POSTED.length = 0;
  click({ rerollgo: 'p-5' }); await sleep(200);
  assert.strictEqual(sentNow()?.whatFailed, 'Wrong voice.', "the box reweaves the writer's own passage on its one press, note and all");
  ok("the Reweave box has the instruction and What didn't work, both survive a repaint, and the press sends both");
}

// ---- A NEW VERSION WRITTEN INLINE LANDS WITHOUT RISING IN AGAIN. Seth, 2026-10-28: "there's a blink
// now when reweaving". The landed passage played `rise` (opacity 0 to 1), so the words written in
// place went out and came back: measured 0.00 opacity in the landing frame on a 390px screen. A
// passage from Continue has been quiet since 2026-10-27; a Reweave was not.
//
// The inline surface is told from the veil by its class (veilReadable), so the #ghost stub answers as
// the inline passage for this block only.
{
  const gh = (document as any).getElementById('ghost'), was = gh.classList.contains;
  gh.classList.contains = (c: string) => c === 'inlive';
  try {
    click({ open: 's-1' });
    await sleep(40);
    // p-5 is the last passage and the writer's own, so the press is asked twice.
    click({ re: 'p-5' }); click({ re: 'p-5' });
    await sleep(200);
    assert.ok(GENERATED.length > 0, 'the reweave was sent');
    const landed = html('col').match(/<div class="block[^"]*"[^>]*>(?:(?!<div class="block)[\s\S])*?data-edit="p-5"/)?.[0] ?? '';
    assert.match(landed, /class="block[^"]* newest quiet/, 'the new version lands quiet: no rise, so no blink');
  } finally { gh.classList.contains = was; }
  ok('a reweave written inline lands without rising in again');
}


// ---- READING MODE SHOWS EVERY CHAPTER (issue #37). Seth, 2026-09-01: "In reading mode I should be
// able to view all chapters without having to swap."
//
// Writing draws one chapter on purpose — 358 passages in the DOM, and no way to jump. Reading is
// where that trade goes the other way. `view()` has always sent every passage in the book, so this
// is a render change and costs no request.
//
// BOTH DIRECTIONS, because "shows everything" is easy to get by accident: the writing view must
// still be scoped to one chapter, or this "fix" is a regression in the mode people spend hours in.
{
  click({ open: 's-1' });
  await sleep(60);

  const chapters = STORY.chapters.length;
  assert.ok(chapters > 1, `the fixture needs more than one chapter to tell these apart (${chapters})`);

  // Writing: one chapter's band only.
  const writing = html('col');
  const bandsWriting = (writing.match(/class="band(?: [^"]*)?"/g) ?? []).length;
  assert.strictEqual(bandsWriting, 1, 'writing draws exactly one chapter band');

  // Reading: one band per chapter.
  click({ readmode: '1' });
  await sleep(60);
  const reading = html('col');
  const bandsReading = (reading.match(/class="band(?: [^"]*)?"/g) ?? []).length;
  assert.strictEqual(bandsReading, chapters,
    `reading draws a band for every chapter (${bandsReading} of ${chapters})`);
  // And the prose of a chapter that is NOT the one being written has to actually be on the page —
  // a band per chapter with no passages under it would satisfy the count and show nothing.
  // NOT GUARDED. `if (other) {...}` with no else is invisible to a count-based harness, and this
  // fixture had no such passage until 2026-09-01 — so the check existed and never ran.
  const other = STORY.passages.find((p: any) => p.chapterId !== STORY.currentChapter.id);
  assert.ok(other, 'the fixture must hold a passage outside the open chapter, or this proves nothing');
  assert.ok(reading.includes(String(other.body).slice(0, 24)),
    'and the prose from another chapter is on the page, not just its heading');
  assert.doesNotMatch(writing, new RegExp(String(other.body).slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    'while the writing view does NOT show it — that is the scoping this must not regress');
  // ONE NEWEST. Only one paragraph in the document animates; a per-chapter "newest" would replay
  // the arrival animation once per chapter on every repaint.
  assert.strictEqual((reading.match(/\bnewest\b/g) ?? []).length, 1,
    'exactly one passage in the whole read is marked newest');

  // Back to writing, and back to one chapter.
  click({ readmode: '0' });
  await sleep(60);
  assert.strictEqual((html('col').match(/class="band(?: [^"]*)?"/g) ?? []).length, 1,
    'leaving reading mode scopes the column back to one chapter');
  ok('reading mode draws every chapter, writing draws one, and only one passage is newest (#37)');
}


// ---- A PASSAGE THAT ARRIVED WHILE YOU WERE AWAY SAYS SO (bugs.md #9, 2026-09-01).
//
// Seth: "i should be able to send and go elsewhere since the command already sent." The server
// persists a generation at completion now, so the passage survives the browser going away — and his
// design for the state it lands in: "unclaimed and offered, and only claimed after the next message
// my thought being editing, regeneration or branching com into play."
//
// THE HARD PART IS NOT SHOWING IT TOO OFTEN. Every take is unclaimed until the next thing is
// written, so marking all of them would put "written while you were away" on prose the writer just
// watched appear. What is marked is `claimed === false` MINUS what this page saw arrive.
{
  click({ open: 's-1' });
  await sleep(60);
  const doc = html('col');

  assert.match(doc, /class="cameback(?: [^"]*)?"/, 'an unclaimed passage this page did not watch is marked');
  assert.match(doc, /written while you were away/, 'and says what happened in words');
  // EXACTLY ONE. Every other fixture passage omits `claimed`, which an older server also omits, and
  // undefined must read as claimed rather than marking the whole book.
  assert.strictEqual((doc.match(/class="cameback(?: [^"]*)?"/g) ?? []).length, 1,
    'and only that one — a missing `claimed` field reads as claimed, not as unclaimed');
  // The prose is THERE, not hidden behind a decision. The row is real; that is the design.
  assert.match(doc, /The bell rang once and nobody came down for it\./,
    'the passage itself is on the page — it is in the book, not in a holding pen');
  // And its tray is the ordinary one, because editing, re-rolling and branching are exactly what
  // the writer might do before standing behind it.
  assert.match(doc, /data-re="p-4"/, 'it can be re-rolled like any other passage');
  assert.match(doc, /data-del="p-4"/, 'and discarded, which is what declining it means');

  ok('a passage written while you were away is marked, once, and is otherwise an ordinary passage');

// ---- SOMETHING WANTS YOU: the light at the top, and the accent on the row.
//
// Seth, 2026-09-03: "if things are waiting then i want the waiting menu item to be accent colored
// and a small light up top in accent color that glows over the screen."
//
// BOTH DIRECTIONS, because a light that is always on says nothing and a light that never comes on
// is the shape this whole feature could ship in without anyone noticing — nothing else on screen
// changes when it works. The shelf fixture carries proposals and unpaid promises on two books, so
// the lit case is the default and the dark case has to be made by emptying it.
{
  click({ open: 's-1' });
  await sleep(40);
  assert.strictEqual(nodes.get('owed').hidden, false,
    'the light is on while the shelf has proposals or unpaid promises');
  // THE WHOLE BUTTON, not a fixed window after the attribute. A `{0,400}` window stopped short of
  // the .txt span that carries the colour and failed for the distance rather than for the colour —
  // the same mistake a slice made in the tipCard check. `</button>` is where the row ends.
  const waitRow = html('rail').match(/data-nav="waiting"[\s\S]*?<\/button>/)?.[0] ?? '';
  assert.ok(waitRow, 'the Waiting row is drawn at all');
  // ADR 0004: a notice, so --warn and not gold (Seth asked for the accent on 2026-09-03; the gold
  // grill moved it, because gold means press here).
  assert.match(waitRow, /class="txt"[^>]*var\(--warn\)/,
    'and it wears the warning colour, in a book that owes something');

  // AND OFF WHEN NOTHING IS OWED. Emptied on the SHELF the light actually reads, and reloaded
  // through the app rather than by writing its state — asserting against a copy the app never
  // looks at would pass with the light stuck on.
  shelfOwes = false;
  click({ home: '1' });
  await sleep(60);
  assert.strictEqual(nodes.get('owed').hidden, true, 'and out when nothing is waiting anywhere');
  // AND THE STATE IS PUT BACK. `home` leaves V null, and the block below re-rolls a passage in an
  // open book — so ending here would fail the next check for a reason that has nothing to do with
  // it. Left open on the same book this block found open.
  shelfOwes = true;
  click({ open: 's-1' });
  await sleep(60);
  ok('the top light and the Waiting row come on when something is owed, and go out when it is not');
}

// ---- CO-OP IS A MODE, AND ONLY WHERE IT MEANS SOMETHING.
//
// Seth, 2026-09-03: "co op would be a mode though. because either of us could call the ai for the
// next beat if needed (writers block)" — so it sits in the dial with the other four and is held
// until you change it, rather than being a press.
//
// THE ABSENCE IS THE HALF THAT MATTERS. A mode that hands the turn to nobody is a mode that does
// nothing, so it must not be on the dial in a book written alone — and a check that only proved it
// APPEARS would pass on a dial that always shows it.
{
  const { MODES } = await import('../web/model.js');
  assert.ok(MODES.some(([k]: any) => k === 'coop'), 'co-op is one of the modes');

  click({ open: 's-1' });
  await sleep(40);
  // #dockCol, not #dock: drawDock writes the composer into the inner element, and reading the
  // outer one gives an empty string that satisfies doesNotMatch on any code at all.
  assert.match(html('dockCol'), /data-modesel/, 'the mode dial is drawn at all');
  assert.doesNotMatch(html('dockCol'), /value="coop"/,
    'and co-op is NOT offered in a book with one writer — there is nobody to hand the move to');

  STORY.writers = [{ id: 'u-me', login: 'sonophage', owns: 1 }, { id: 'u-kia', login: 'kia', owns: 0 }];
  click({ open: 's-1' });
  await sleep(40);
  assert.match(html('dockCol'), /value="coop"/, 'and IS offered once the book has a second writer');

  // AND IT NEVER CALLS THE MODEL. That is the whole of the mode: the text goes to the write route
  // and nothing goes to generate. Asserted on what was POSTED, because a mode that quietly
  // generated would look identical on screen.
  POSTED.length = 0;
  pickMode('coop');
  // The VALUE on the element, not just an input event: `generate` reads `$('input').value`, and
  // typeIn only dispatches — so a send after it sees an empty box and refuses with a toast.
  nodes.get('input').value = 'She set the lamp down and said nothing.';
  click({ send: '1' });
  await sleep(300);
  assert.ok(POSTED.some((p: any) => String(p.url) === '/api/write'),
    'co-op puts your part on the page');
  assert.ok(!POSTED.some((p: any) => String(p.url).includes('/api/generate')),
    'and asks the model for nothing at all — that is what the mode is');
  STORY.writers = undefined;
  ok('co-op is a mode, offered only in a shared book, and it never calls the model');
}

// ---- AND A BOOK CAN BE HANDED TO SOMEBODY. The control that calls a second writer in.
//
// THIS HAD NO CHECK AT ALL when it was built, and Seth could not find it on the live app twice
// running while every server-side answer was correct. A feature whose only proof is "I wrote the
// markup" is a feature nobody has seen render.
{
  click({ open: 's-1' });
  await sleep(40);
  click({ storytab: 'keep' });
  const keep = html('sideBody');
  assert.match(keep, /Write it with someone/, 'the owner is offered a way to call somebody in');
  // THE NAME, NOT THE ADDRESS. ANANSI_ALLOW maps a tailnet email onto an account; the option shows
  // the account and sends the login, so the picker reads `kia` and the route still resolves it.
  assert.match(keep, /<option value="hellrigelkc@gmail\.com">kia<\/option>/,
    'and it names her as the app does, while sending the login the server resolves');
  // ---- AND OPENING A BOOK MUST NOT ERASE WHO YOU ARE. This is the bug that hid the control:
  // `openStory` rebuilt SRV from four named fields and dropped `demo`, `me` and `mates`, so every
  // server answer was correct and the picker still drew nothing. Asserted AFTER a book is open,
  // because before one it passed.
  assert.match(keep, /f-share/, 'the picker survives opening a book — SRV is merged, not rebuilt');
  click({ open: 's-2' });
  await sleep(40);
  click({ storytab: 'keep' });
  assert.match(html('sideBody'), /Write it with someone/,
    'and survives opening a second one — a rebuild that names fields drops the next one added');
  ok('the owner of a book is offered a way to write it with somebody else');
}

  // AND WATCHING ONE UNMARKS IT. Re-rolling p-4 is being here for it: the route reports the row it
  // landed, the page remembers it, and the line goes even though the row is still unclaimed —
  // claiming happens on the next thing WRITTEN, not on having looked.
  //
  // This is the half that had no test until it was falsified: deleting the `WATCHED.add` reddened
  // nothing, because no check had ever driven a generation to completion here.
  // The server reports that THIS is the row it landed, which is what makes the page a witness.
  stubPassageId = 'p-4';
  POSTED.length = 0;
  click({ re: 'p-4' });
  // Long enough for the whole chain: the streamed generation and the refetch of the story. 80ms was
  // not, and the failure looked exactly like the marker never clearing.
  await sleep(600);

  // THE PAGE WAITS FOR THE VEIL NOW (2026-09-02). Seth: "dont send the content to the main page
  // until that tap happens ... otherwise it overloads the browser." `paint()` rebuilt the whole
  // reading column while the typewriter was drawing a letter every 38ms behind a full-screen blur,
  // and the animation is what lost. So the repaint is handed to the veil and runs when it is
  // dismissed. Asserted in both directions, because "it repaints eventually" would pass on the old
  // behaviour and on a veil that never held anything back.
  assert.match(html('col'), /class="cameback(?: [^"]*)?"/,
    'the page must NOT be rebuilt while the veil is still up — that is the whole point of holding it');

  // Typing is one of the three ways out, and the one this harness can drive: the click stub's
  // `closest` answers every selector, so a fake tap looks like a tap on a button.
  typeIn('input', 'x');
  for (let i = 0; i < 40 && /class="cameback"/.test(html('col')); i++) {
    await sleep(25);
  }
  assert.doesNotMatch(html('col'), /class="cameback(?: [^"]*)?"/,
    'a passage this page watched arrive is not marked as having arrived while away');

  // ---- AND IT IS SAID OUT LOUD. The fade is the only sign a passage landed and a screen reader
  // cannot see it: this app streams prose in and announced nothing at all until 2026-09-03.
  //
  // HERE, because this is the block that actually lands one — `arrive()` runs off the generation
  // chain, so an assertion in a block that only renders a fixture reads an empty region and fails
  // for the wrong reason. It did, first time.
  //
  // NOT the prose: the passage is in the document already and a reader moves to it, so reading it
  // into a live region too says the whole thing twice. And not `aria-live` on #col, which is
  // rewritten whole on every repaint — that would read the chapter out again on every panel press.
  await sleep(120);
  assert.match(String(nodes.get('announce').textContent), /^(Passage added|New take), \d+ words\.$/,
    `a passage that lands is announced with its length — said ${JSON.stringify(nodes.get('announce').textContent)}`);
  {
    const { readFileSync: rf } = await import('node:fs');
    const shell = rf(new URL('../app.html', import.meta.url), 'utf8');
    assert.match(shell, /id="announce"[^>]*aria-live="polite"/, 'and the region is live');
    assert.match(shell, /id="toast"[^>]*role="status"/, 'and the toast reports itself as one');
    // Off screen, NOT display:none — a region that is not rendered is not announced at all.
    assert.match(shell, /\.vh \{[^}]*clip-path/, 'the region is hidden by clipping, not by display');
    assert.doesNotMatch(shell, /\.vh \{[^}]*display:\s*none/, 'or it would never be read');
  }
  stubPassageId = undefined;
  ok('and watching one arrive unmarks it, and the arrival is announced to a screen reader');
}

// ---- STOP TELLS THE SERVER, because hanging up no longer cancels (bugs.md #9).
//
// Stop was `STOP?.abort()` on the fetch and nothing else, which made "the writer changed their mind"
// and "the phone lost signal" the same event at the server — and that is precisely why a backgrounded
// tab lost the passage. A closed connection is now harmless, so Stop has to say so out loud or it
// would leave the generation running and land a passage the writer just asked not to have.
{
  POSTED.length = 0;
  click({ stop: '1' });
  await sleep(40);
  assert.ok(POSTED.find((x: any) => String(x.url) === '/api/stop'),
    'Stop posts to /api/stop — the abort alone would not reach the server');
  ok('Stop tells the server, now that a dropped connection does not');
}


// ---- ANANSI'S WEB SEARCH REMEMBERS WHETHER IT IS ON (2026-09-01).
//
// Seth: "i really only need it for search." The switch was `S.talk.search`, set on the checkbox and
// stored nowhere, so it reset to off on every reload — a writer researching for an hour re-ticked it
// after every refresh. Per DEVICE and not per writer, the same argument the hardware-keyboard flag
// makes: the desk may have a search endpoint reachable where a phone on mobile data does not.
{
  const changeIn = (target: any) => (listeners.change ?? []).forEach((f: Function) => f({ target }));
  const KEY = 'anansi.websearch';
  (globalThis as any).localStorage.setItem(KEY, '0');

  changeIn({ dataset: { websearch: '1' }, checked: true });
  assert.strictEqual((globalThis as any).localStorage.getItem(KEY), '1',
    'ticking it is remembered, or the choice dies with the page');

  changeIn({ dataset: { websearch: '1' }, checked: false });
  assert.strictEqual((globalThis as any).localStorage.getItem(KEY), '0',
    'and unticking it is remembered too — a one-way memory is worse than none');

  // THE DEFAULT IS STILL OFF, and that is not the same question as whether the choice persists.
  // This one sends the writer's question to a third party, so the first time is theirs to decide.
  const { readFileSync: readSrc } = await import('node:fs');
  const fresh = readSrc(new URL('../web/app.js', import.meta.url), 'utf8');
  assert.match(fresh, /localStorage\.getItem\(WEBSEARCH\) === '1'/,
    'the stored value is read back as a strict "1", so an empty store reads as OFF');
  ok("whether Anansi looks things up is remembered per device, and still starts off");
}

// ---- #92 · ONE CARD PER HEMMED SCENE, on the Workbench deck.
//
// Since #89 a hem runs after the end-scene route answers and chalks everything into the scene's
// group, `scene:<chapterId>`; the chapter carries its hem (running or done, the pass report, the
// suggestion for the next scene, out of date, the threads past the cap). The fixture is shaped
// like `src/story.ts` hands it over. A fake of the hem routes answers with the view and records
// what was asked; everything else falls through to the canned server.
const HEM_ROWS = [
  { id: 'hs-1', entryId: 'e-1', title: 'Envoy Sereth', body: 'She has stopped waiting.', entryType: 'state',
    kind: 'memory', keys: ['2'], delta: 'stopped waiting', chapterId: 'c-1', grp: 'scene:c-1' },
  { id: 'hs-2', entryId: 'e-1', title: 'Envoy Sereth', body: 'Clipped now, every word counted.',
    entryType: 'character', kind: 'changed', field: 'voice', target: 'a-on', keys: [], delta: 'clipped',
    chapterId: 'c-1', grp: 'scene:c-1' },
  { id: 'hs-3', entryId: 'e-2', title: 'The stair', body: 'Nobody climbs it after this scene.',
    entryType: 'retire', kind: 'retire', keys: ['2'], chapterId: 'c-1', grp: 'scene:c-1' },
  { id: 'hs-4', entryId: null, title: 'The bellringer', body: 'Rings the hour, never the alarm.',
    entryType: 'character', kind: 'new', field: 'facts', keys: [], chapterId: 'c-1', grp: 'scene:c-1',
    rooms: { voice: { name: 'Hoarse', body: 'Hoarse from the tower.' } } },
];
// A card from before #89: one thread's group. It must be drawn exactly as it always was.
const OLD_ROW = { id: 'hp-1', entryId: 'e-fired', title: 'The lamplighter', body: 'He came at five, not six.',
  entryType: 'state', kind: 'memory', keys: ['2'], chapterId: 'c-1', grp: 'hem:c-1:e-fired' };
const HEM_DONE = { state: 'done', startedAt: 1, finishedAt: 2,
  passes: { summary: null, memory: null, facts: null, finished: null, next: null }, keptSummary: false,
  suggestion: { title: 'The Rust Year', note: 'By the end the debt is called in, with Marek in the room.',
    opens: 'Rain on the shutters.' }, outOfDate: false, overflow: ['Coyle', 'Vantic law'] };
let HEM_VIEW: any = null;
const hemView = (hem: any, rows: any[]) => ({ ...STORY,
  chapters: STORY.chapters.map((c: any) => ({ ...c, hem: c.id === 'c-1' ? hem : null })),
  // Envoy Sereth has an Over time entry in force: that is the "before" of her state row.
  entries: STORY.entries.map((e: any) => e.id === 'e-1' ? { ...e, nowStateId: 'st-1',
    states: [{ id: 'st-1', fromChapter: 1, body: 'She waits by the door, gloved.' }] } : e),
  proposals: rows, strings: [] });
const hemFetch = (canned: any) => async (url: string, init?: any) => {
  const body = init?.body ? JSON.parse(init.body) : null;
  const reply = (o: any) => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o) });
  if (url.startsWith('/api/story?') || url === '/api/chapter/hem' || url === '/api/summary') {
    if (body) POSTED.push({ url, body });
    return reply(HEM_VIEW);
  }
  return canned(url, init);
};
/** THE WATCH ON A RUNNING HEM, HELD. While a hem runs the app reads the tale again on a 3-second
 *  timer (`watchHems`). Here that timer is caught rather than waited out, so a running fixture
 *  neither slows the suite nor fires into a later block; the end-scene block below runs it by hand.
 *  Every other timer runs as usual. Restored at the end of that block. */
const HEM_TIMERS: Function[] = [];
const REAL_SET_TIMEOUT = globalThis.setTimeout;
(globalThis as any).setTimeout = (fn: Function, ms?: number, ...rest: any[]) =>
  ms === 3000 ? HEM_TIMERS.push(fn) : REAL_SET_TIMEOUT(fn as any, ms, ...rest);
/** The one scene card in the side panel's markup, from its opening tag to the next card. */
const hemCardOf = (side: string) => {
  const at = side.indexOf('data-deckkind="hem"');
  if (at < 0) return '';
  const next = side.indexOf('data-deckcard=', at);
  return side.slice(at, next < 0 ? undefined : next);
};
{
  const canned = (globalThis as any).fetch;
  (globalThis as any).fetch = hemFetch(canned);
  const settle = () => sleep(40);
  HEM_VIEW = hemView(HEM_DONE, [...HEM_ROWS, OLD_ROW]);
  click({ open: 's-1' }); await settle();
  click({ panel: 'waiting' }); await settle();
  const side = html('sideBody');
  // EACH THREAD IS ONE CARD (Seth, 2026-10-30: "Each thread as a whole should be one card. That way
  // it's easy to swipe left or right or edit in place"), in the order the hem's threads were: the
  // threads the tale has, then new ones. The scene keeps a card for the hem's own state.
  const cards = [...side.matchAll(/data-deckcard="\d+" data-deckkind="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(cards.filter((k) => k === 'hem').length, 1, 'THREAD-CARDS: one card for the scene itself');
  const tcard = (title: string) => {
    const at = side.search(new RegExp(`data-deckkind="hemthread"[^>]*>\\s*<div class="decksub">[^<]*</div>\\s*<div class="serif decktitle">${title}<`));
    if (at < 0) return '';
    const next = side.indexOf('data-deckcard=', at);
    return side.slice(at, next < 0 ? undefined : next);
  };
  const sereth = tcard('Envoy Sereth'), stair = tcard('The stair'), bell = tcard('The bellringer');
  assert.ok(sereth && stair && bell, 'THREAD-CARDS: each thread it changed is a card of its own');
  assert.ok(side.indexOf(sereth) < side.indexOf(stair) && side.indexOf(stair) < side.indexOf(bell),
    '  the threads the tale has first, then new threads');
  assert.match(sereth, /class="decksub">Character · from Ashfall</, '  saying what kind of thread, and which scene');
  assert.match(sereth, /Where it stands[\s\S]*data-deckdiff="hs-1"[\s\S]*How she sounds[\s\S]*data-deckdiff="hs-2"/,
    '  with each change on it, by what it is');
  assert.match(sereth, /data-deckall="accept" data-ids="hs-1,hs-2" data-deckright="1">Sew it in/, 'THREAD-ONE-YES: one Sew it in, for the whole thread, the swipe right');
  assert.match(sereth, /data-deckall="reject" data-ids="hs-1,hs-2" data-deckleft="1">&larr; Reject/, '  and one Reject, the swipe left');
  assert.doesNotMatch(side, /data-decide="accept" data-id="hs-/, 'THREAD-NO-ROW-BUTTONS: no Sew it in on each change');
  // ONE POCKET OUT, NOT THE THREAD (Seth, 2026-10-30: "I should be able to discard per pocket not the
  // line as a whole"): each row of a card with more than one has a quiet ✕ that rejects it alone.
  assert.match(sereth, /class="hemdrop" data-decide="reject" data-id="hs-1"[\s\S]*class="hemdrop" data-decide="reject" data-id="hs-2"/,
    'THREAD-ROW-DISCARD: each change on a thread\'s card can be discarded on its own');
  assert.match(bell, /data-hemroom="voice"[\s\S]*?class="hemdrop" data-droppocket="hs-4" data-slot="voice"/,
    '  and each pocket a new thread arrives with, on its own');
  assert.doesNotMatch(sereth, />Edit</, '  and no Edit fold');
  // EDITED IN PLACE: a tap on the text opens its box, which is what Sew it in sends.
  assert.doesNotMatch(sereth, /class="hemedit"[^>]*role="button"/, 'THREAD-EDIT-TOUCH: the text is not a role=button, or a tap on Was opens the box (2026-10-30)');
  assert.match(sereth, /data-hemedit="hs-1"[^>]*>[\s\S]*?<div class="hembox" hidden>\s*<textarea class="field" data-pbody="hs-1"[^>]*>She has stopped waiting\./,
    'THREAD-EDIT: tapping the text opens its box in place, holding the chalked text');
  const { diffHTML } = await import('../web/model.js');
  assert.ok(sereth.includes(`data-deckdiff="hs-1">${diffHTML('She waits by the door, gloved.', 'She has stopped waiting.')}`),
    'an Over time change shows the entry in force against the chalked text, as a diff');
  assert.ok(sereth.includes(`data-deckdiff="hs-2">${diffHTML('Flat, unhurried.', 'Clipped now, every word counted.')}`),
    'a pocket change shows the pocket as it is against the chalked text, as a diff');
  assert.match(stair, /Retire[\s\S]*Nobody climbs it/, 'a retirement is its thread\'s card');
  assert.doesNotMatch(stair, /data-hemedit/, '  with no text to edit');
  assert.match(bell, /New character[\s\S]*Rings the hour/, 'a new thread is a card, marked new, with what it would say');
  // THE SCENE'S CARD: its summary, the threads past the cap, and Reopen the hem; no threads.
  const card = hemCardOf(side);
  assert.match(card, /data-hemsumtext="c-1"[^>]*>Ilva arrives\./, 'the scene card holds the summary, in a box');
  assert.doesNotMatch(card, /<button[^>]*data-hemsum="c-1"/, '  with no Save press: it saves as you go (ADR 0004)');
  assert.doesNotMatch(card, /data-hemthread=|data-deckdiff=/, '  and none of the threads, which have cards of their own');
  assert.ok(card.indexOf('data-hemsumtext') < card.indexOf('data-hemopen='), 'HEM-ORDER: the summary, then Reopen the hem');
  assert.match(card, /Coyle/, 'the threads past the cap are named');
  assert.match(card, /Vantic law/);
  assert.match(card, /data-hemagain="c-1" data-names="[^"]*Coyle[^"]*Vantic law[^"]*"/,
    '  with a press that asks for them by name');
  // THE OLD PER-THREAD CARD, as it always was.
  assert.match(side, /Hemming found[\s\S]*?data-deckall="accept" data-ids="hp-1"[^>]*>Sew it in/,
    'an old per-thread hem card is drawn as before');
  // A CHALKED CHANGE OUTSIDE A HEM shows the same diff (#122): the thread's text against the chalk.
  const { diffHTML: diffOf } = await import('../web/model.js');
  assert.ok(side.includes(`data-deckdiff="hp-1">${diffOf('[comes at six]', 'He came at five, not six.')}`),
    'a chalk card reads what is there now against what is chalked, with the one renderer');
  // And a row with nothing before it (a new thread, a retirement) has no diff to read.
  assert.doesNotMatch(side, /data-deckdiff="hs-[34]"/, '  and a new thread or a retirement has none');
  (globalThis as any).fetch = canned;
  click({ open: 's-1' }); await settle();
  ok('each thread a hem changed is one Workbench card, with one Sew it in and one Reject, edited in place');
}

// ---- #125 · WHERE THE TALE STANDS: ON THE HEM'S CARD AS A DIFF, AND IN THE TALE'S SETTINGS ----
{
  const canned = (globalThis as any).fetch;
  (globalThis as any).fetch = hemFetch(canned);
  const settle = () => sleep(40);
  const { diffHTML } = await import('../web/model.js');
  const NOW = 'Five houses now; the sixth has burned.';
  const TALE = { id: 'e-tale', title: 'The tale', body: 'Six houses.', entryType: 'tale', keys: [], addons: [],
    states: [], nowStateId: null };
  const row = { id: 'ht-1', entryId: 'e-tale', title: 'The tale', body: NOW, entryType: 'state', kind: 'memory',
    keys: ['2'], delta: 'where the tale stands', chapterId: 'c-1', grp: 'scene:c-1' };
  // Where a string stands now: a pocket of the tale's thread, chalked by the same hem.
  const str = { id: 'ht-2', entryId: 'e-tale', title: 'The tale', body: 'The debt is half paid.', entryType: 'tale',
    kind: 'memory', field: 'promise', target: 'x-1', pocket: 'The debt', keys: [], chapterId: 'c-1', grp: 'scene:c-1' };
  HEM_VIEW = { ...hemView({ ...HEM_DONE, passes: { ...HEM_DONE.passes, tale: 'the model did not answer' } },
    [HEM_ROWS[0], row, str]), taleThread: TALE };
  click({ open: 's-1' }); await settle();
  click({ panel: 'waiting' }); await settle();
  const wb = html('sideBody'), card = hemCardOf(wb);
  // The tale's thread is a card of its own (2026-10-30), first, before the threads the tale has.
  const at = wb.search(/data-deckkind="hemthread"[^>]*>\s*<div class="decksub">[^<]*<\/div>\s*<div class="serif decktitle">The tale</);
  const taleCard = at < 0 ? '' : wb.slice(at, wb.indexOf('data-deckcard=', at) < 0 ? undefined : wb.indexOf('data-deckcard=', at));
  assert.ok(taleCard.includes(`data-deckdiff="ht-1">${diffHTML('Six houses.', NOW)}`),
    "TALE-DIFF: the tale's card shows where the tale stands against the premise, as a diff");
  assert.ok(at > 0 && at < wb.search(/<div class="serif decktitle">Envoy Sereth</), "TALE-BLOCK: the tale's thread is one card, first");
  assert.match(taleCard, /Where it stands[\s\S]*data-deckdiff="ht-1"[\s\S]*The debt[\s\S]*data-deckall="accept" data-ids="ht-1,ht-2"/,
    '  where the tale stands, then the string by its name, sewn in together');
  assert.match(card, /Where the tale stands<\/span> did not run/, 'TALE-PASS: and names the pass when it did not run');

  // THE TALE'S SETTINGS: the premise is how the tale began; where it stands now shows once one is sewn in.
  const book = () => html('sideBody').match(/data-group="book"[\s\S]*?data-group="world"/)?.[0] ?? '';
  click({ panel: 'story' }); await settle();
  assert.match(book(), /<label class="lbl" for="f-story-premise">How the tale began/, 'TALE-BEGAN: the premise is how the tale began');
  assert.doesNotMatch(book(), /Where it stands now/, '  and with nothing sewn in there is no other paragraph');
  HEM_VIEW = { ...HEM_VIEW, taleThread: { ...TALE, nowStateId: 'ts-1', states: [{ id: 'ts-1', fromChapter: 2, body: NOW }] } };
  click({ open: 's-1' }); await settle();
  click({ panel: 'story' }); await settle();
  // #130. Shown once, on the Thread tab: not under how the tale began as well.
  assert.doesNotMatch(book(), /Where it stands now|data-talenow/, 'TALE-NOW-ONCE: where it stands now is not on the Tale tab');
  click({ panel: '' }); click({ storytab: 'thread' }); click({ panel: 'story' }); await settle();
  assert.match(html('sideBody').match(/data-group="thread"[\s\S]*/)?.[0] ?? '', /Where the tale stands[\s\S]*?Where it stands now[\s\S]*?the sixth has burned/,
    "TALE-OWN: the tale's own thread shows where it stands too");
  (globalThis as any).fetch = canned;
  click({ open: 's-1' }); await settle();
  ok("where the tale stands is a diff on the hem's card, the Tale tab shows how it began, and the Thread tab where it stands now");
}

// ---- #92 · THE CARD'S STATES, and the presses each one offers: running, a pass that did not run
// (Try again for that pass), out of date (Hem again), and the threads past the cap (asked for by
// name). Each press goes to `POST /api/chapter/hem` (#91) with what it names, and nothing else.
{
  const canned = (globalThis as any).fetch;
  (globalThis as any).fetch = hemFetch(canned);
  const settle = () => sleep(40);
  const show = async (hem: any, rows: any[]) => {
    HEM_VIEW = hemView(hem, rows);
    click({ open: 's-1' }); await settle();
    click({ panel: 'waiting' }); await settle();
    return hemCardOf(html('sideBody'));
  };
  const asked = () => POSTED.filter((p: any) => p.url === '/api/chapter/hem');

  // RUNNING: the card is there before anything is chalked, and says the hem is still going.
  let card = await show({ ...HEM_DONE, state: 'running', finishedAt: null, suggestion: null, overflow: [] }, []);
  assert.ok(card, 'a running hem has its card on the Workbench before anything is chalked');
  assert.match(card, /still hemming/, '  and it says the hem is still going');
  assert.doesNotMatch(card, /data-deckall|data-hemsumtext/, '  with nothing to sew in and no summary yet');

  // A PASS THAT DID NOT RUN, named with its reason, and Try again for that pass alone.
  card = await show({ ...HEM_DONE, passes: { ...HEM_DONE.passes, memory: 'the model did not answer' } }, HEM_ROWS);
  assert.match(card, /Changes to the people in it<\/span> did not run &mdash; the model did not answer/,
    'a pass that did not run is named on the card, with the reason');
  assert.doesNotMatch(card, /New threads<\/span> did not run/, '  and a pass that ran is not');
  let before = asked().length;
  click({ hemagain: 'c-1', pass: 'memory' }); await settle();
  assert.strictEqual(asked().length, before + 1, 'Try again asks once');
  assert.deepStrictEqual(asked().at(-1).body, { storyId: 's-1', chapterId: 'c-1', pass: 'memory' },
    '  for that pass only');

  // OUT OF DATE, with Hem again, which asks twice: it drops what is still chalked on the card.
  card = await show({ ...HEM_DONE, outOfDate: true }, HEM_ROWS);
  assert.match(card, /Out of date/, 'a scene changed after its hem is marked out of date');
  assert.match(card, /<button[^>]*data-hemagain="c-1">Hem again</, '  with Hem again');
  card = await show(HEM_DONE, HEM_ROWS);
  assert.doesNotMatch(card, /Out of date|>Hem again</, '  and a scene in date is not');
  before = asked().length;
  click({ hemagain: 'c-1' }); await settle();
  assert.strictEqual(asked().length, before, 'Hem again asks first, and the first press sends nothing');
  click({ hemagain: 'c-1' }); await settle();
  assert.deepStrictEqual(asked().at(-1).body, { storyId: 's-1', chapterId: 'c-1' },
    '  and the second hems the whole scene again');

  // THE THREADS PAST THE CAP, asked for by name.
  click({ hemagain: 'c-1', names: JSON.stringify(['Coyle', 'Vantic law']) }); await settle();
  assert.deepStrictEqual(asked().at(-1).body, { storyId: 's-1', chapterId: 'c-1', names: ['Coyle', 'Vantic law'] },
    'asking for the threads past the cap sends their names');

  // DONE AND DECIDED: nothing chalked, every pass ran, and no next scene waiting on its suggestion.
  // The card has done its job and leaves the deck.
  const wasCurrent = STORY.currentChapter;
  STORY.currentChapter = { ...STORY.chapters[0] } as any;
  card = await show({ ...HEM_DONE, overflow: [] }, []);
  assert.strictEqual(card, '', 'a hem with nothing left to decide has no card');
  // OUT OF DATE BRINGS IT BACK (story 19): the scene changed after its hem, so Hem again needs a
  // card to sit on even with nothing chalked, and Leave it moves on without hemming.
  card = await show({ ...HEM_DONE, overflow: [], outOfDate: true }, []);
  assert.match(card, /<button[^>]*data-hemagain="c-1">Hem again</, 'HEM-STALE-CARD: an out-of-date scene keeps its card, with Hem again');
  // DISMISS, for good (Seth, 2026-10-27): "Leave it" only moved on for the session. Dismiss is
  // the existing "set aside" row, keyed to this hem, so a new hem brings the card back.
  assert.match(card, /data-dismiss="hem" data-ref="c-1:\d+"[^>]*>&larr; Dismiss</, 'HEM-DISMISS: and Dismiss, keyed to this hem');
  card = await show({ ...HEM_DONE, overflow: [], outOfDate: true, dismissed: true }, []);
  assert.strictEqual(card, '', '  and a dismissed hem with nothing chalked leaves the deck');
  card = await show({ ...HEM_DONE, overflow: [], outOfDate: true, dismissed: true }, HEM_ROWS);
  assert.match(html('sideBody'), /data-deckkind="hemthread"/, '  but never hides threads still waiting to be sewn in or rejected: they are cards of their own');
  // WHICH PASS, FOR HOW LONG, and the new threads held past six (2026-10-27).
  card = await show({ ...HEM_DONE, state: 'running', finishedAt: null, overflow: [],
    current: { pass: 'memory', since: Date.now() - 3 * 60000 - 5000 } }, []);
  assert.match(card, /data-hemnow="c-1">Working on Changes to the people in it&hellip; 3 min</, 'HEM-NOW: a running hem says which pass and for how long');
  card = await show({ ...HEM_DONE, overflow: [], extra: ['Keeper 7', 'Keeper 8'] }, HEM_ROWS);
  assert.match(card, /Keeper 7, Keeper 8[\s\S]*data-hemextra="c-1">Chalk these too</, 'HEM-HELD: new threads past six are named, with Chalk these too');
  STORY.currentChapter = wasCurrent;

  (globalThis as any).fetch = canned;
  click({ open: 's-1' }); await settle();
  ok('the scene card shows a running hem, a pass that did not run, and out of date, each with its press (#92)');
}

// ---- THE HEM'S SET UP THE NEXT SCENE OPENS ON ANYONE NEW (the speed pass, 2026-10-30): how it starts,
// its name, where it heads and who is in it are said on the hem, so the step left is the one it opens.
{
  click({ open: 's-1' }); await sleep(40);
  click({ panel: 'setup', setupat: 'more' }); await sleep(30);
  assert.match(html('sideBody'), /<div class="serif title-md">Anyone new<\/div>/, 'HEM-SETUP-AT: it opens the setup on Anyone new');
  click({ panel: '' }); await sleep(20);
  ok('the hem\'s Set up the next scene opens on Anyone new');
}

// ---- A HEM WITH NOTHING LEFT TO DECIDE LEAVES THE WORKBENCH (Seth, 2026-10-30: "Once I'm done
// hemming it still shows in the workbench"): its next-scene suggestion waiting is not a decision.
{
  const canned = (globalThis as any).fetch;
  (globalThis as any).fetch = hemFetch(canned);
  HEM_VIEW = hemView({ ...HEM_DONE, overflow: [] }, []);
  click({ open: 's-1' }); await sleep(40);
  click({ panel: 'waiting' }); await sleep(40);
  assert.doesNotMatch(html('sideBody'), /data-deckkind="hem"/, 'HEM-GONE-WHEN-DONE: a done hem with nothing chalked has no card on the Workbench');
  HEM_VIEW = hemView({ ...HEM_DONE, overflow: [], outOfDate: true }, []);
  click({ open: 's-1' }); await sleep(40);
  click({ panel: 'waiting' }); await sleep(40);
  assert.match(html('sideBody'), /data-deckkind="hem"/, '  and one out of date still has, with Hem again on it');
  (globalThis as any).fetch = canned;
  click({ open: 's-1' }); await sleep(40);
  ok('a hem with nothing left to decide leaves the Workbench');
}

// ---- THE HEM CARD SETS UP NOTHING ITSELF (Seth, 2026-10-29): the summary, the threads, and one
// press, Set up the next scene, which opens the setup on The next scene. The next scene's boxes,
// Something else, Use these and who is in it are the setup's, and only the setup's.
{
  const canned = (globalThis as any).fetch;
  (globalThis as any).fetch = hemFetch(canned);
  const settle = () => sleep(40);
  HEM_VIEW = hemView(HEM_DONE, HEM_ROWS);
  click({ open: 's-1' }); await settle();
  click({ panel: 'waiting' }); await settle();
  const card = hemCardOf(html('sideBody'));
  assert.match(card, /data-hemsumtext="c-1"/, 'HEM-CARD-SUM: the card has the summary');
  assert.match(html('sideBody'), /data-deckkind="hemthread"[\s\S]*?Envoy Sereth/, '  and the threads, each a card of its own');
  const setupAt = card.search(/<button[^>]*data-hemopen="c-1"[^>]*>Reopen the hem &rarr;</);
  assert.ok(setupAt > card.indexOf('data-hemsumtext='), 'HEM-CARD-REOPEN: and ends with Reopen the hem, after the summary');
  for (const [re, what] of [[/data-hemnext=/, "the next scene's boxes"], [/data-hemsteer=/, 'a direction for Anansi'],
    [/data-hemreroll=/, 'Something else'], [/data-usehem=/, 'Use these'], [/data-hemwho|data-pin=/, 'who is in it']] as const)
    assert.doesNotMatch(card, re, `HEM-CARD-GONE: the card has no ${what}`);
  assert.doesNotMatch(card, /Rain on the shutters|By the end the debt is called in/,
    "  and does not show the next scene's suggestion: the setup does");

  // THE SUMMARY SAVES AS YOU GO (ADR 0004): when the writer leaves the box, as the writer's (#46).
  // `change` on a textarea is the leaving, never a keystroke, so nothing saves mid-sentence.
  const sums = () => POSTED.filter((p: any) => p.url === '/api/summary');
  const leave = (value: string) => (listeners.change ?? []).forEach((f: Function) =>
    f({ target: { value, dataset: { hemsumtext: 'c-1' } } }));
  leave('Ilva arrives, and stays.'); await settle();
  assert.deepStrictEqual(sums().at(-1)?.body,
    { storyId: 's-1', chapterId: 'c-1', summary: 'Ilva arrives, and stays.' },
    'HEM-SUM-AS-YOU-GO: leaving the summary box saves what is in it, as the writer\'s');
  const saved = sums().length;
  leave('   '); await settle();
  assert.strictEqual(sums().length, saved, '  and an emptied box saves nothing: removing a summary stays on Chapters');

  // REOPEN THE HEM opens the hem screen on that scene (Seth, 2026-10-30).
  click({ hemopen: 'c-1' }); await settle();
  assert.match(html('sideBody'), /<ol class="hemsteps">/, 'HEM-REOPEN: Reopen the hem opens the hem screen, its steps on top');
  // THE SETUP, from there, opens on The next scene, for the scene the hem opened, showing what
  // `nextSetup` reads: the scene's own title (The Envoy), the suggestion where it has nothing.
  const chapterSaves = POSTED.filter((p: any) => p.url === '/api/chapter').length;
  click({ panel: 'setup' }); click({ setupstep: 'premise' }); await settle();
  const setup = html('sideBody');
  assert.deepStrictEqual([...setup.matchAll(/data-setupstep="([a-z]+)"([^>]*?)>/g)]
    .filter((m) => /rgba\(217,178,106,\.42\)/.test(m[2])).map((m) => m[1]), ['premise'],
    'HEM-SETUP-OPENS: the press opens the setup on The next scene');
  assert.match(setup, /data-setup="title" value="The Envoy"/, "  with the scene's own title");
  assert.match(setup, /data-setup="note"[^>]*>By the end the debt is called in, with Marek in the room\./, '  the suggested note');
  assert.match(setup, /data-setup="opens"[^>]*>Rain on the shutters\./, '  and the suggested opening');
  assert.strictEqual(POSTED.filter((p: any) => p.url === '/api/chapter').length, chapterSaves,
    '  and saves nothing until the writer does');
  // WHAT THE SCENE HAS BEEN GIVEN WINS over the suggestion: the one reader, `nextSetup`.
  HEM_VIEW = { ...HEM_VIEW, chapters: HEM_VIEW.chapters.map((c: any) => c.id === 'c-2' ? { ...c, authorsNote: 'Her own note.' } : c),
    currentChapter: { ...HEM_VIEW.currentChapter, authorsNote: 'Her own note.' } };
  click({ open: 's-1' }); await settle();
  click({ panel: 'waiting' }); await settle();
  click({ panel: 'setup' }); click({ setupstep: 'premise' }); await settle();
  assert.match(html('sideBody'), /data-setup="note"[^>]*>Her own note\./, "HEM-SETUP-OWN: the scene's own note, once it has one");
  assert.doesNotMatch(html('sideBody'), /with Marek in the room/, '  and not the suggestion');
  (globalThis as any).fetch = canned;
  click({ skipsetup: '1' }); await settle();
  click({ open: 's-1' }); await settle();
  ok('the hem card is the summary, the threads and Reopen the hem; the setup opens The next scene');
}

// ---- NOTHING TWICE ACROSS THE SETUP (Seth, 2026-10-29). The summary lives on the Workbench, so What
// it left does not repeat it, nor Set up the next scene, which it is already part of. A new thread a
// hem chalked is Anyone new's, so What it left shows only the threads the tale has.
{
  const canned = (globalThis as any).fetch;
  (globalThis as any).fetch = hemFetch(canned);
  const settle = () => sleep(40);
  HEM_VIEW = hemView(HEM_DONE, HEM_ROWS);
  click({ open: 's-1' }); await settle();
  click({ panel: 'setup' }); await settle();
  click({ setupstep: 'cards' }); await settle();
  const left = html('sideBody');
  assert.match(left, /data-deckkind="hemthread"[\s\S]*?decktitle">Envoy Sereth</, 'SETUP-LEFT: What it left has the scene\'s threads, a card each');
  assert.doesNotMatch(left, /data-hemsumtext=/, 'SETUP-LEFT-NOSUM: and not the summary, which is on the Workbench');
  assert.doesNotMatch(left, /data-hemopen=/, '  nor Reopen the hem');
  assert.doesNotMatch(left, /The bellringer/, 'SETUP-LEFT-NONEW: nor a new thread, which is Anyone new\'s');
  assert.match(left, /data-deckall="accept" data-ids="hs-1,hs-2"[^>]*>Sew it in/, '  each thread sewn in whole from its card');
  assert.match(left, /1 &middot; What it left <span[^>]*>3</, '  and its count is the three changes');
  assert.match(left, /3 &middot; Anyone new <span[^>]*>1</, "  and Anyone new's is the new thread");
  click({ setupstep: 'more' }); await settle();
  const more = html('sideBody');
  assert.match(more, /data-hemthread="new:The bellringer"/, 'SETUP-NEW-HERE: the new thread is on Anyone new, as a thread block');
  assert.doesNotMatch(more, /data-hemthread="e-1"|data-hemsumtext=/, '  and nothing of What it left is');
  (globalThis as any).fetch = canned;
  click({ skipsetup: '1' }); await settle();
  click({ open: 's-1' }); await settle();
  ok("What it left holds the scene's thread changes only; its new threads are on Anyone new");
}

// ---- ANYONE NEW IS WHERE THE WRITER CHOOSES WHO IS IN THE SCENE (Seth, 2026-10-29). Every thread in
// it is a block, drawn as What it left draws a thread (its name, its kind, its pockets), with how it
// comes in: This scene only (a pin for the scene), Always on, or When it's named, through the
// existing pin and thread routes. ✕ takes one out: an always-on thread is left out of the scene, a
// pinned one is unpinned. A thread is brought in by search, and a new thread sewn in gets the same
// choice. A stateful fake, so each press changes what the next read hands back.
// A SCENE NO HEM OPENED (2026-11-01): one a hem opened is asked who is in it on the hem screen, and
// Anyone new only says it (WHO-ONCE, below).
{
  const canned = (globalThis as any).fetch;
  const settle = () => sleep(40);
  HEM_VIEW = { ...hemView(null, HEM_ROWS), pins: [] };
  (globalThis as any).fetch = async (url: string, init?: any) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    const reply = (o: any) => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o) });
    if (url === '/api/pin') {
      POSTED.push({ url, body });
      const pins = HEM_VIEW.pins.filter((p: any) => !(p.chapterId === body.chapterId && p.entryId === body.entryId));
      HEM_VIEW = { ...HEM_VIEW, pins: body.mode ? [...pins, { chapterId: body.chapterId, entryId: body.entryId, mode: body.mode }] : pins };
      return reply({ ok: true });
    }
    if (url === '/api/entry') {
      POSTED.push({ url, body });
      HEM_VIEW = { ...HEM_VIEW, entries: HEM_VIEW.entries.map((e: any) => e.id === body.entry.id ? { ...e, activation: body.entry.activation } : e) };
      return reply({ ok: true });
    }
    if (url === '/api/proposal') {
      POSTED.push({ url, body });
      const p = HEM_VIEW.proposals.find((x: any) => x.id === body.id);
      HEM_VIEW = { ...HEM_VIEW, proposals: HEM_VIEW.proposals.filter((x: any) => x.id !== body.id),
        entries: body.accept && p && !p.entryId ? [...HEM_VIEW.entries, { id: 'e-bell', title: p.title, body: '', entryType: p.entryType,
          activation: 'triggered', keys: ['bell'], lastEditor: 'model', states: [], notes: '',
          addons: [{ id: 'a-bell', slot: 'facts', name: 'Always true', body: p.body, keys: [], active: true }] }] : HEM_VIEW.entries };
      return reply({ ok: true });
    }
    return hemFetch(canned)(url, init);
  };
  const sent = (from: number) => POSTED.slice(from).filter((p: any) => ['/api/pin', '/api/entry'].includes(p.url))
    .map((p: any) => p.url === '/api/pin' ? `pin ${p.body.entryId} ${p.body.mode}` : `entry ${p.body.entry.id} ${p.body.entry.activation}`);
  const more = async () => { click({ setupstep: 'more' }); await settle(); return html('sideBody'); };
  const who = (side: string, id: string) => {
    const at = side.indexOf(`data-whothread="${id}"`);
    if (at < 0) return '';
    const end = side.indexOf('data-whothread=', at + 1);
    return side.slice(side.lastIndexOf('<div', at), end < 0 ? undefined : end);
  };
  click({ open: 's-1' }); await settle();
  click({ panel: 'setup' }); await settle();
  let side = await more();
  // WHO IS IN IT, AS BLOCKS: the always-on threads; not a thread on a word with no pin. (Rules are
  // pockets of the tale since 2026-10-29, not threads, so none can be in it.)
  const sereth = who(side, 'e-1');
  // ONE LINE A THREAD (Seth, 2026-10-29, option A): the name, its kind, one pill, ✕; no pockets.
  assert.match(sereth, /class="whorow" data-whothread="e-1"/, 'WHO-LINE: a thread in the scene is one line');
  assert.match(sereth, /data-entry="e-1"[\s\S]*?data-hemthreadname[^>]*>Envoy Sereth</, '  with its name, which opens the thread');
  assert.match(sereth, /<span class="whokind">Character</, '  its kind');
  assert.doesNotMatch(sereth, /Flat, unhurried\./, '  and no pockets: they are a press away');
  assert.ok(who(side, 'e-shared'), '  every thread in it');
  assert.strictEqual(who(side, 'e-2'), '', '  and not a thread on a word with no pin');
  // THE EYE, NOT A PILL (Seth, 2026-11-01: "make Anyone new use the eye too"): the Threads list's mark
  // and switch, on, on a word, off in this scene.
  const eyeOf = (id: string) => who(html('sideBody'), id).match(/data-flipact="[^"]+" data-whokeep="1" data-look="(\w+)" data-reach="(\w+)"/)?.slice(1);
  assert.deepStrictEqual(eyeOf('e-1'), ['eye', 'on'], 'WHO-EYE: an always-on thread shows the open eye');
  assert.doesNotMatch(sereth, /whopill|data-howin=/, '  and no pill');
  assert.doesNotMatch(side, /data-pin=|data-place=/, 'WHO-NO-TICKS: the old tick list is gone');
  const whoTip = side.match(/id="tip-setWho"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '';
  assert.ok(/eye/.test(whoTip) && !/pill|This scene only/.test(whoTip), `WHO-TIP-EYE: its help says the eye, not the pill (${whoTip.slice(-160)})`);

  // THE SAME ORDER AS THE LIST (2026-11-02): on → off (for the whole tale) → on a word → on.
  let from = POSTED.length;
  click({ flipact: 'e-1', whokeep: '1' }); await settle(); await settle();
  assert.deepStrictEqual(sent(from), ['entry e-1 off'], 'WHO-EYE-OFF: a tap turns it off, for the whole tale');
  assert.deepStrictEqual(eyeOf('e-1'), ['eyeoff', 'off'], '  and it stays listed, struck through');
  from = POSTED.length;
  click({ howout: 'e-1' }); await settle();
  assert.deepStrictEqual([sent(from), eyeOf('e-1')], [[], undefined], 'WHO-OUT-OFF: ✕ on a thread that is off takes it off the list and writes nothing');
  from = POSTED.length;
  click({ flipact: 'e-1', whokeep: '1' }); await settle(); await settle();
  assert.deepStrictEqual(sent(from), ['entry e-1 triggered'], 'WHO-EYE-WORD: a second tap puts it on a word');
  assert.deepStrictEqual(eyeOf('e-1'), ['eyeshut', 'word'], '  and it is listed again, asleep');
  from = POSTED.length;
  click({ flipact: 'e-1', whokeep: '1' }); await settle(); await settle();
  assert.deepStrictEqual(sent(from), ['entry e-1 always_on'], 'WHO-EYE-ON: a third tap puts it back on');
  assert.deepStrictEqual(eyeOf('e-1'), ['eye', 'on'], '  and the eye is open again');
  // ✕ ON AN ALWAYS-ON THREAD leaves it out of this scene.
  from = POSTED.length;
  click({ howout: 'e-1' }); await settle(); await settle();
  assert.deepStrictEqual(sent(from), ['pin e-1 force_out'], 'WHO-OUT: ✕ leaves an always-on thread out of the scene');
  assert.strictEqual(who(html('sideBody'), 'e-1'), '', '  and it leaves the list');

  // BROUGHT IN BY SEARCH, for this scene.
  typeIn('setupQ', 'stair'); await settle();
  side = html('sideBody');
  assert.match(side, /data-howin="e-2" data-how="scene"[^>]*aria-label="Bring The stair into/, 'WHO-ADD: searching finds a thread to bring in');
  from = POSTED.length;
  click({ howin: 'e-2', how: 'scene' }); await settle(); await settle();
  assert.deepStrictEqual(sent(from), ['pin e-2 force_in'], '  and bringing it in pins it into the scene');
  typeIn('setupQ', ''); await settle();
  assert.deepStrictEqual(eyeOf('e-2'), ['eyeheard', 'woken'], '  and it is listed, sent for this scene');
  // ✕ ON A PINNED THREAD unpins it.
  from = POSTED.length;
  click({ howout: 'e-2' }); await settle(); await settle();
  assert.deepStrictEqual(sent(from), ['pin e-2 null'], 'WHO-UNPIN: ✕ on a pinned thread takes the pin off');

  // A NEW THREAD, SEWN IN, GETS THE SAME CHOICE.
  side = html('sideBody');
  assert.match(side, /data-hemthread="new:The bellringer"/, 'the new thread is chalked here');
  click({ decide: 'accept', id: 'hs-4' }); await settle(); await settle();
  side = html('sideBody');
  assert.match(who(side, 'e-bell'), /data-hemthreadname[^>]*>The bellringer</, 'WHO-SEWN: sewn in, the new thread is a line on the list');
  assert.ok(eyeOf('e-bell'), '  with its eye');
  from = POSTED.length;
  click({ flipact: 'e-bell', whokeep: '1' }); await settle(); await settle();
  assert.strictEqual(sent(from).length, 1, `  and a tap goes through (${sent(from)})`);

  // MENTION ONLY IN THIS SCENE (2026-11-01): an always-on thread the brief did not name has a
  // `mention` pin, is not in the scene at its start, and its eye says on a word; a tap holds it out.
  HEM_VIEW = { ...HEM_VIEW, pins: [...HEM_VIEW.pins, { chapterId: 'c-2', entryId: 'e-shared', mode: 'mention' }] };
  click({ open: 's-1' }); await settle(); click({ panel: 'setup' }); await settle();
  side = await more();
  assert.strictEqual(who(side, 'e-shared'), '', 'WHO-MENTION: a mention-only thread is not listed as in the scene');
  from = POSTED.length;
  click({ flipact: 'e-shared', whokeep: '1' }); await settle(); await settle();
  assert.deepStrictEqual(sent(from), ['pin e-shared null', 'entry e-shared always_on'],
    '  and its eye is on a word: a tap takes the mention pin off and puts it on');
  // THE SETTING, behind ⓘ and shut, not a block of text at the foot.
  side = html('sideBody');
  assert.match(side, /data-tip="setSetting"[^>]*aria-expanded="false"/, 'WHO-TIP: the setting is behind ⓘ');
  assert.match(side, /<div class="tipcard" id="tip-setSetting" hidden>[\s\S]*?Ashfall Hall/, '  shut, holding the setting');
  assert.doesNotMatch(side.replace(/<div class="tipcard"[^>]*>[\s\S]*?<\/div>[\s\S]*?<\/div>/g, ''), /Ashfall Hall/,
    '  and nowhere else on the step');
  (globalThis as any).fetch = canned;
  click({ skipsetup: '1' }); await settle();
  click({ open: 's-1' }); await settle();
  ok('Anyone new: who is in the scene, as thread blocks, each with how it comes in');
}

// ---- EACH CONTROL IN ONE PLACE (Seth, 2026-10-29): across the Workbench's hem card and the setup's
// three steps, the summary, Set up the next scene, the next scene's boxes and who is in it each sit
// on one screen; and within the setup no thread is on two steps. The thread blocks themselves are the
// one deck the Workbench and What it left share (#74), so they are not counted across that pair.
{
  const canned = (globalThis as any).fetch;
  (globalThis as any).fetch = hemFetch(canned);
  const settle = () => sleep(40);
  // WHAT THE NEXT SCENE NEEDS FOR WHO IS IN IT (2026-11-01): a pocket chalked against the scene being
  // set up, for a thread the tale has, is on Anyone new, beside its new threads, and on no other step.
  const NEED = { id: 'pn-1', chapterId: 'c-2', entryId: 'e-took', title: 'Vantic law', body: 'The writ is burned.',
    entryType: 'lore', kind: 'changed', field: 'atmosphere', status: 'open', delta: '' };
  HEM_VIEW = hemView(HEM_DONE, [...HEM_ROWS, NEED]);
  click({ open: 's-1' }); await settle();
  click({ panel: 'waiting' }); await settle();
  const screens: Record<string, string> = { workbench: hemCardOf(html('sideBody')) };
  click({ panel: 'setup' }); await settle();
  for (const step of ['cards', 'premise', 'more']) { click({ setupstep: step }); await settle(); screens[step] = html('sideBody'); }
  // WHO IS IN IT, ASKED ONCE (Seth, 2026-11-01: "not having duplicate fields or steps"): a scene a hem
  // opened is asked on the hem screen; Anyone new says who, and one press goes back to that list.
  assert.match(screens.more, /data-whosaid>[^<]*Envoy Sereth/, 'WHO-ONCE: Anyone new says who is in a scene a hem opened');
  click({ hemwhoagain: 'c-1' }); await settle();
  screens.hem = html('sideBody');
  assert.match(screens.hem, /class="card hemwho/, '  and Change who is in it opens that list on the hem screen');
  const controls: Record<string, RegExp> = {
    'what the next scene is': /data-setup="brief"|data-hemsteer=/,
    'the summary': /data-hemsumtext=/, 'Reopen the hem': /data-hemopen=/,
    "the next scene's title": /data-setup="title"/, 'its note': /data-setup="note"/, 'its opening': /data-setup="opens"/,
    'Have Anansi suggest another': /data-name=/, 'how a thread comes in': /data-whokeep=/, 'taking a thread out': /data-howout=/,
    'finding a thread to bring in': /id="setupQ"/, "the tale's setting": /data-tip="setSetting"/,
  };
  for (const [what, re] of Object.entries(controls)) {
    const on = Object.keys(screens).filter((k) => re.test(screens[k]));
    assert.strictEqual(on.length, 1, `ONCE: ${what} is on one screen, not ${JSON.stringify(on)}`);
  }
  // ONE NAME, ONE STEP: the setup draws the hem's steps above its own, so none of its names may be one
  // of the hem's ("The next scene" was both Anansi's draft and the setup's boxes).
  const hemNames = [...screens.more.matchAll(/<span class="hemname">([^<]+)</g)].map((m) => m[1].trim());
  const setupNames = [...screens.more.matchAll(/data-setupstep="\w+"[^>]*>\d &middot; ([^<]+?)(?: <|<)/g)].map((m) => m[1].trim());
  assert.ok(hemNames.length && setupNames.length === 3, `  (read ${hemNames.length} hem steps, ${setupNames.length} setup steps)`);
  assert.deepStrictEqual(setupNames.filter((n) => hemNames.includes(n)), [], 'ONCE-NAMES: no setup step has a hem step\'s name');
  const threads = (s: string) => [...s.matchAll(/data-hemthread="([^"]+)"/g)].map((m) => m[1]);
  const twice = threads(screens.cards).filter((k) => threads(screens.more).includes(k) || threads(screens.premise).includes(k));
  assert.deepStrictEqual(twice, [], 'ONCE-THREADS: no thread is on two steps of the setup');
  assert.match(screens.more, /data-hemthread="e-took"[\s\S]*The writ is burned\./,
    'NEEDS-HERE: a pocket the next scene needs for a thread it has is on Anyone new');
  (globalThis as any).fetch = canned;
  click({ skipsetup: '1' }); await settle();
  click({ open: 's-1' }); await settle();
  ok('each control of the hem flow is in one place');
}

// ---- #92 · HEM THIS SCENE OPENS THE NEXT ONE AT ONCE, and the card arrives without a reload.
//
// The route answers before the passes run (#89). The writer lands in the new scene, blank: the hem
// brings the suggestion, so nothing asks Anansi for a name. While a hem runs, the tale is read
// again now and then; when it finishes the card is on the Workbench, and the reading stops.
{
  const canned = (globalThis as any).fetch;
  const settle = () => sleep(40);
  // Before: Scene 2 being written. After: Scene 2 closed and hemming, Scene 3 blank.
  // Its own id: the panel asks for a name once per scene id per session, and earlier blocks here
  // have already opened a `c-3`, so reusing one would pass without the rule under test.
  const c3 = { id: 'c-hem3', index: 3, title: 'Scene 3', summary: null, authorsNote: null, opensWith: null,
    status: 'open', coversThrough: null, summaryStale: false, keepWhole: false, hem: null };
  const after = (hem: any, rows: any[]) => ({ ...STORY, strings: [], proposals: rows,
    chapters: [{ ...STORY.chapters[0], hem: null }, { ...STORY.chapters[1], status: 'closed', hem }, c3],
    currentChapter: { ...c3 } });
  const running = { ...HEM_DONE, state: 'running', finishedAt: null, suggestion: null, overflow: [],
    passes: {} };
  // What the close holds for the writer's answer is on the hem's row (`held`), as the server keeps it;
  // the answer empties it.
  const holding = { ...running, held: ['tale', 'memory', 'next'] };
  const rows = HEM_ROWS.map((p) => ({ ...p, chapterId: 'c-2', grp: 'scene:c-2' }));
  let VIEW: any = { ...STORY, chapters: STORY.chapters.map((c: any) => ({ ...c, hem: null })) };
  let reads = 0;
  (globalThis as any).fetch = async (url: string, init?: any) => {
    const reply = (o: any) => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o) });
    if (url.startsWith('/api/story?')) { reads++; return reply(VIEW); }
    if (url === '/api/summary') { POSTED.push({ url, body: JSON.parse(init.body) }); return reply(VIEW); }
    if (url === '/api/chapter/end') {
      POSTED.push({ url, body: JSON.parse(init.body) });
      VIEW = after(holding, []);
      return reply({ closed: 'c-2', opened: 'c-hem3', ...VIEW });
    }
    if (url === '/api/chapter/hem') {
      POSTED.push({ url, body: JSON.parse(init.body) });
      if (JSON.parse(init.body).asked) VIEW = after(running, []);
      return reply(VIEW);
    }
    return canned(url, init);
  };
  // The watches the blocks above left waiting, run against a tale with nothing hemming: each
  // reads once and stops, so this block starts with no watch.
  const timers = HEM_TIMERS;
  while (timers.length) { timers.shift()!(); await settle(); }
  try {
    click({ open: 's-1' }); await settle();
    assert.strictEqual(timers.length, 0, 'nothing is read again while no hem is running');
    const proposes = POSTED.filter((p: any) => p.url === '/api/chapter/propose').length;
    click({ endchapter: '1' }); await settle(); await settle();
    const end = POSTED.find((p: any) => p.url === '/api/chapter/end');
    assert.ok(end, 'Hem this scene closes the scene');
    // THE HEM ASKS FOR THE NEXT SCENE (Seth, 2026-10-30): the close does not guess it first, and the
    // drawer stays open on the hem, asking how the next scene should start while the passes run.
    assert.strictEqual(end.body.next, false, 'HEM-ASKS: the close leaves the next scene to be asked for');
    assert.strictEqual(end.body.ask, true, 'HEM-HOLDS-ASKED: and holds where things stand until it is (2026-10-30)');
    assert.ok(!nodes.get('side').hidden, 'HEM-STAYS: the hem drawer stays open while it runs');
    // THE EDITOR'S FULL SCREEN (Seth, 2026-10-30: "It should use the editor full screen ui").
    const rootEl = (globalThis as any).document.documentElement;
    assert.strictEqual(rootEl.dataset.sidefull, '1', 'HEM-FULL: the hem drawer is full screen');
    // THE HEM, IN THE WRITER'S ORDER (Seth, 2026-10-30: "while the steps start it should ask me about
    // the next scene and once I press enter then I can remove or add currently existing threads"):
    // how it starts first, gold, while the passes run.
    let side = html('sideBody');
    assert.match(side, /What is the next scene\?[\s\S]*data-hemsteer="c-2"/, 'HEM-ASK-BOX: it asks what the next scene is (Seth, 2026-11-01)');
    assert.match(side, /class="btn fill[^"]*" data-hemnext="c-2"/, '  with one gold press to send it');
    assert.strictEqual((side.match(/class="btn (?!ghost)[^"]*"/g) ?? []).length, 1, '  and no other gold on the drawer');
    assert.match(side, /data-hemstep="next"[^>]*>[\s\S]*?Waiting for what the next scene is/, '  and the next-scene step waits on the writer');
    assert.doesNotMatch(side, /data-hemwhodone=/, '  and who is in it waits its turn');
    (listeners.input ?? []).forEach((f: Function) => f({ target: { dataset: { hemsteer: 'c-2' }, value: 'Days later, in his bookstore.' } }));
    click({ hemnext: 'c-2' }); await settle();
    const asked = POSTED.filter((p: any) => p.url === '/api/chapter/hem').at(-1);
    assert.deepStrictEqual(asked?.body, { storyId: 's-1', chapterId: 'c-2', pass: 'next', asked: true, brief: 'Days later, in his bookstore.' },
      'HEM-ASKED: the brief is sent with the next-scene pass');
    // THEN WHO IS IN IT, gold, with the list and Done; the summary waits for Done and for the scans.
    side = html('sideBody');
    assert.doesNotMatch(side, /data-hemsteer=/, 'HEM-WHO-NEXT: the box gives way once sent');
    assert.match(side, /data-hemstep="who"[^>]*data-state="you"/, '  to who is in the next scene, the gold step');
    assert.match(side, /class="card hemwho[\s\S]*data-hemwhodone="c-2"/, '  with its list and Done');
    assert.doesNotMatch(side, /data-hemsumtext=/, '  and no summary yet');
    click({ hemwhodone: 'c-2' }); await settle();
    side = html('sideBody');
    assert.doesNotMatch(side, /data-hemwhodone=/, 'HEM-WHO-DONE: Done puts it away');
    assert.match(side, /still reading the scene/, '  and while the scans run, it says the summary comes when they are done');
    // THE SUMMARY AS SOON AS IT IS WRITTEN (the speed pass, 2026-10-30): the next read, with the summary
    // pass done and the rest still running, shows it; the cards wait for the hem to be done.
    VIEW = after({ ...running, passes: { summary: null }, current: { pass: 'facts', since: Date.now() } }, rows);
    VIEW.chapters[1] = { ...VIEW.chapters[1], summary: 'The envoy is seen home.' };
    assert.ok(timers.length > 0, '  a read is waiting while the hem runs');
    timers.shift()!(); await settle();
    // The watch redraws the drawer's lower half in place, which this stub DOM cannot do; the drawer
    // drawn again shows what it would put there.
    click({ panel: 'ritual' }); await settle();
    side = html('sideBody');
    assert.match(side, /data-hemsumread="c-2"[^>]*>The envoy is seen home\./, 'SUMMARY-EARLY: the summary shows as soon as it is written');
    // SKIP REMOVES IT, ON A SECOND PRESS: a scene with no summary is sent whole until it has one.
    let sent = POSTED.length;
    click({ hemsumskip: 'c-2' }); await settle();
    assert.ok(!POSTED.slice(sent).some((p: any) => p.url === '/api/summary'), 'HEM-SUM-SKIP-ASKS: one press of Skip removes nothing');
    click({ hemsumskip: 'c-2' }); await settle();
    assert.strictEqual(POSTED.slice(sent).find((p: any) => p.url === '/api/summary')?.body?.summary, '',
      'HEM-SUM-SKIP: the second removes the summary');
    click({ panel: 'ritual' }); await settle();
    side = html('sideBody');
    assert.match(side, /still on the rest/, '  with a line saying the rest is still running');
    assert.doesNotMatch(side, /data-deckkind=/, '  and no cards until the hem is done');
    VIEW = after(running, []);
    // Setup opens on what the scene left (its card, running), and the new scene is one step on.
    click({ panel: 'setup' }); await settle();
    assert.match(html('sideBody'), /<ol class="hemsteps">[\s\S]*data-state="(run|wait)"/, 'its setup opens with the hem\'s steps, still going');
    assert.strictEqual(rootEl.dataset.sidefull, '1', '  and so is the setup');
    assert.match(html('sideBody'), /<ol class="hemsteps">[\s\S]*data-hemstep="setup"/, 'HEM-STEPS-SETUP: the hem\'s steps stay on top of the setup');
    // THE WIZARD WAITS FOR THE SCANS (Seth, 2026-10-30: "don't let the wizard move until the scans
    // are done"): its steps and its way out are shut while the hem runs, and it says why.
    let setup = html('sideBody');
    assert.match(setup, /data-setupstep="premise"[^>]*disabled/, 'HEM-WAIT: the next step is shut while the hem runs');
    assert.match(setup, /data-skipsetup="1"[^>]*disabled/, '  and so is Skip');
    assert.match(setup, /still reading the last scene/, '  and it says why');
    click({ setupstep: 'premise' }); await settle();
    assert.doesNotMatch(html('sideBody'), /data-setup="title"/, 'HEM-WAIT-PRESS: a press on it does not move the wizard');
    assert.strictEqual(POSTED.filter((p: any) => p.url === '/api/chapter/propose').length, proposes,
      '  and nothing asks Anansi to name it while the hem runs');
    click({ panel: 'waiting' }); await settle();
    assert.strictEqual(rootEl.dataset.sidefull, '0', 'HEM-FULL-ONLY: the Workbench is the drawer as before');

    // STILL RUNNING: read again, nothing changes, and it is read again later.
    click({ panel: 'waiting' }); await settle();
    assert.match(hemCardOf(html('sideBody')), /still hemming/, 'the Workbench shows the hem running');
    assert.strictEqual(timers.length, 1, 'while it runs, one read is waiting');
    reads = 0;
    timers.shift()!(); await settle();
    assert.strictEqual(reads, 1, '  and it reads the tale once');
    assert.strictEqual(timers.length, 1, '  and while it still runs, it waits to read again');

    // DONE: the next read brings the card, and nothing more is read.
    VIEW = after({ ...HEM_DONE, overflow: [] }, rows);
    timers.shift()!(); await settle();
    const card = hemCardOf(html('sideBody'));
    assert.match(html('sideBody'), /data-deckall="accept" data-ids="hs-1/, 'when the hem finishes, its thread cards arrive without a reload');
    assert.doesNotMatch(card, /still hemming/, '  and no longer says it is running');
    // AND ONCE IT IS DONE THE WIZARD MOVES.
    click({ panel: 'setup' }); await settle();
    click({ setupstep: 'premise' }); await settle();
    assert.match(html('sideBody'), /data-setup="title"/, 'HEM-WAIT-DONE: once the hem is done, the wizard moves on');
    // AND ASKS HOW THE SCENE STARTS, FIRST, and names nothing until asked (Seth, 2026-10-30: "What I
    // enter should be what's used").
    const premise = html('sideBody');
    assert.ok(premise.indexOf('How should this scene start?') >= 0
      && premise.indexOf('How should this scene start?') < premise.indexOf('data-setup="title"'),
      'SETUP-OPENS-FIRST: the setup asks how the scene starts, above its title');
    assert.strictEqual(POSTED.filter((p: any) => p.url === '/api/chapter/propose').length, proposes,
      'SETUP-NO-AUTONAME: after a hem, Anansi does not name the scene before the writer says how it starts');
    const opensBox = { dataset: { setup: 'opens' }, value: 'Days later, in his bookstore.' };
    const doc = (globalThis as any).document, q0 = doc.querySelector;
    doc.querySelector = (sel: string) => (sel === '[data-setup="opens"]' ? opensBox : q0.call(doc, sel));
    try {
      (listeners.input ?? []).forEach((f: Function) => f({ target: opensBox }));
      click({ name: 'c-hem3' }); await settle();
    } finally { doc.querySelector = q0; }
    assert.strictEqual(POSTED.filter((p: any) => p.url === '/api/chapter/propose').at(-1)?.body?.opens,
      'Days later, in his bookstore.', 'SETUP-OPENS-SENT: asking Anansi sends the opening as the writer typed it');
    click({ panel: 'waiting' }); await settle();
    assert.strictEqual(timers.length, 0, '  and the reading stops');
  } finally {
    (globalThis as any).setTimeout = REAL_SET_TIMEOUT;
    (globalThis as any).fetch = canned;
  }
  click({ open: 's-1' }); await settle();
  ok('Hem this scene asks how the next one starts while it runs, and the card arrives without a reload (#92)');
}

// ---- ASKED ONCE, AND PAUSED IF NEVER ANSWERED (Seth, 2026-10-30) ----
// Whether the hem still waits on how the next scene starts is the hem's row (`held`), not the tab: a
// reload after answering does not ask again, and a hem never answered shows paused on the scene's
// Workbench card, with one press that runs what it held.
{
  const canned = (globalThis as any).fetch;
  (globalThis as any).fetch = hemFetch(canned);
  const settle = () => sleep(40);
  const c3 = { id: 'c-pz3', index: 3, title: 'Scene 3', summary: null, authorsNote: null, opensWith: null,
    status: 'open', coversThrough: null, summaryStale: false, keepWhole: false, hem: null };
  const at = (hem: any, opensWith: string | null = null) => ({ ...STORY, strings: [], proposals: [],
    // Its own id for the hemmed scene: the block above answered `c-2` in this tab, which is the very
    // memory a reload loses.
    chapters: [{ ...STORY.chapters[0], hem: null }, { ...STORY.chapters[1], id: 'c-pz2', status: 'closed', hem }, { ...c3, opensWith }],
    currentChapter: { ...c3, opensWith } });
  const done = { ...HEM_DONE, overflow: [], suggestion: null, passes: { summary: null, facts: null, finished: null } };
  try {
    // ANSWERED, STILL RUNNING, AFTER A RELOAD: the tab remembers nothing, the row says it was answered.
    HEM_VIEW = at({ ...done, state: 'running', finishedAt: null, held: [] });
    click({ open: 's-1' }); await settle();
    click({ panel: 'ritual' }); await settle();
    assert.doesNotMatch(html('sideBody'), /data-hemsteer=/, 'HEM-ASKED-STORED: a reload does not ask again once the hem was answered');
    // HELD, AND NOT ASKED HERE (the writer typed the opening on the setup): paused on the card.
    HEM_VIEW = at({ ...done, held: ['tale', 'memory', 'next'] }, 'At dawn, on the far bank.');
    click({ open: 's-1' }); await settle();
    click({ panel: 'waiting' }); await settle();
    const card = hemCardOf(html('sideBody'));
    assert.match(card, /Paused[\s\S]*Where the tale stands[\s\S]*Changes to the people in it/, 'HEM-PAUSED-CARD: the scene\'s card says what is paused');
    assert.match(card, /<button class="btn ghost" data-hemresume="c-pz2">/, '  with one press to run them');
    POSTED.length = 0;
    click({ hemresume: 'c-pz2' }); await settle();
    assert.deepStrictEqual(POSTED.find((p: any) => p.url === '/api/chapter/hem')?.body,
      { storyId: 's-1', chapterId: 'c-pz2', pass: 'next', asked: true },
      'HEM-RESUME: the press is the answer with no opening sent, so the passes read the scene\'s own');
    // NOTHING HELD: no paused line.
    HEM_VIEW = at({ ...done, held: [] }, 'At dawn, on the far bank.');
    click({ open: 's-1' }); await settle();
    click({ panel: 'waiting' }); await settle();
    assert.doesNotMatch(html('sideBody'), /data-hemresume=/, 'HEM-NOT-PAUSED: a hem holding nothing is not paused');
  } finally {
    (globalThis as any).fetch = canned;
  }
  click({ open: 's-1' }); await settle();
  ok('the hem asks once, by what its row holds, and a hem never answered is paused with a press to run it');
}

// ---- DRAFTED FROM THE BRIEF (Seth, 2026-11-01): the opening and where the scene is going show on the
// hem's screen, each to use, edit or skip; the opening waits in the composer as the first Direct, and
// skipped, the composer is left to a plain Continue.
{
  const canned = (globalThis as any).fetch;
  // The chapter route answers with the tale, its opening emptied, as the real route's view would be.
  (globalThis as any).fetch = async (url: string, init?: any) => {
    if (url !== '/api/chapter') return hemFetch(canned)(url, init);
    const body = JSON.parse(init.body); POSTED.push({ url, body });
    const c = { ...HEM_VIEW.currentChapter, ...body.chapter };
    HEM_VIEW = { ...HEM_VIEW, currentChapter: c, chapters: HEM_VIEW.chapters.map((x: any) => (x.id === c.id ? c : x)) };
    return { ok: true, status: 200, json: async () => HEM_VIEW, text: async () => JSON.stringify(HEM_VIEW) };
  };
  const settle = () => sleep(40);
  const OPENS = 'At dawn, on the far bank.', NOTE = 'He reaches the far bank and finds the bell waiting.';
  const c3 = { id: 'c-br3', index: 3, title: 'The Far Bank', summary: null, authorsNote: NOTE, opensWith: OPENS,
    brief: 'Oren crosses at dawn.', status: 'open', coversThrough: null, summaryStale: false, keepWhole: false, hem: null };
  HEM_VIEW = { ...STORY, strings: [], proposals: [],
    chapters: [{ ...STORY.chapters[0], hem: null }, { ...STORY.chapters[1], id: 'c-br2', status: 'closed',
      hem: { ...HEM_DONE, overflow: [], held: [], suggestion: { title: 'The Far Bank', note: NOTE, opens: OPENS } } }, c3],
    currentChapter: c3 };
  try {
    nodes.get('input').value = '';
    click({ open: 's-1' }); await settle();
    assert.strictEqual(nodes.get('input').value, OPENS, 'PREFILL: an empty scene with an opening puts it in the composer');
    assert.match(html('dockCol'), /<option value="direct" selected/, '  in Direct, unsent');
    nodes.get('input').value = '';
    click({ open: 's-1' }); await settle();
    assert.strictEqual(nodes.get('input').value, '', 'PREFILL-ONCE: a box the writer emptied stays empty');
    nodes.get('input').value = OPENS;
    click({ panel: 'ritual' }); await settle();
    click({ hemwhodone: 'c-br2' }); await settle();
    assert.ok(JSON.parse((globalThis as any).localStorage.getItem('anansi.hemwho') ?? '[]').includes('c-br2'),
      'WHO-KEPT: Done on who is in the next scene is kept on this device, so a reload does not ask again');
    let side = html('sideBody');
    assert.match(side, /class="card hemdrafts[\s\S]*How it opens[\s\S]*At dawn, on the far bank\.[\s\S]*Where it is going[\s\S]*finds the bell waiting/,
      'DRAFTS: the hem shows the opening and where it is going, drafted from the brief');
    assert.match(side, /The Far Bank, drafted from your brief/, 'DRAFTS-SAYS-BRIEF: and says so, as the scene has a brief');
    assert.match(side, /data-hemskip="opens"[\s\S]*data-setupat="premise"[\s\S]*data-hemuse="opens"/, '  each with Skip, Edit and Use');
    click({ hemuse: 'note', ch: 'c-br3' }); await settle();
    assert.match(html('sideBody'), /Where it is going: using it\./, 'DRAFTS-USE: Use folds that one');
    POSTED.length = 0;
    click({ hemskip: 'opens', ch: 'c-br3' }); await settle();
    assert.deepStrictEqual(POSTED.find((p: any) => p.url === '/api/chapter')?.body?.chapter, { opensWith: '' },
      'DRAFTS-SKIP: Skip empties the opening in the scene');
    assert.strictEqual(nodes.get('input').value, '', '  and takes it out of the composer, for a plain Continue');
    // START WRITING WITH AN OPENING WRITES NOTHING FOR THEM (the hem walk, 2026-11-01): it pressed
    // Continue with the opening still in the box, which went on the page as the writer's own passage.
    HEM_VIEW = { ...HEM_VIEW, currentChapter: { ...HEM_VIEW.currentChapter, opensWith: OPENS },
      chapters: HEM_VIEW.chapters.map((x: any) => (x.id === 'c-br3' ? { ...x, opensWith: OPENS } : x)) };
    click({ open: 's-1' }); await settle();
    nodes.get('input').value = '';
    GENERATED.length = 0;
    click({ savesetup: '1' }); await settle(); await settle();
    assert.deepStrictEqual([GENERATED.length, nodes.get('input').value], [0, OPENS],
      'START-WAITS: Start writing with an opening puts it in the box and sends nothing');
    // NO BRIEF, NO CLAIM OF ONE (Seth, 2026-11-01: the scene "has nothing to do with the brief I
    // wrote"). His words never arrived, and the card still said the drafts were from them.
    HEM_VIEW = { ...HEM_VIEW, currentChapter: { ...HEM_VIEW.currentChapter, brief: null },
      chapters: HEM_VIEW.chapters.map((x: any) => (x.id === 'c-br3' ? { ...x, brief: null } : x)) };
    click({ open: 's-1' }); await settle();
    click({ panel: 'ritual' }); await settle();
    side = html('sideBody');
    assert.ok(/class="card hemdrafts/.test(side) && !/from your brief/.test(side) && /Anansi chose The Far Bank/.test(side),
      'DRAFTS-NO-BRIEF: with no brief on the scene, the card says Anansi chose it');
  } finally {
    (globalThis as any).fetch = canned;
  }
  click({ open: 's-1' }); await settle();
  ok('the opening and where the scene is going, drafted from the brief, can be used, edited or skipped, and the opening is the first Direct');
}

// ---- ASKED AGAIN WITH A DIRECTION, THE BOXES TAKE THE NEW ANSWER (Seth, 2026-10-30: "the how it
// starts from hemming a scene doesn't update when I give anansi a new direction"). Typing the
// direction copied the boxes into the draft, and the draft's words, Anansi's own from the last ask,
// were then kept as if the writer had typed them. Only a box the writer typed in is kept.
{
  const doc = (globalThis as any).document;
  const wasQS = doc.querySelector;
  const boxes: Record<string, any> = {
    title: { dataset: { setup: 'title' }, value: 'The Old Name' },
    note: { dataset: { setup: 'note' }, value: 'Where Anansi said it went before, long enough to count.' },
    opens: { dataset: { setup: 'opens' }, value: 'How Anansi said it opened before.' },
    brief: { dataset: { setup: 'brief' }, value: '' } };
  const typeIn = (k: string, v: string) => { boxes[k].value = v;
    (listeners.input ?? []).forEach((f: Function) => f({ target: boxes[k] })); };
  try {
    click({ open: 's-1' }); await sleep(40);
    click({ panel: 'setup' }); click({ setupstep: 'premise' }); await sleep(30);
    doc.querySelector = (sel: string) => boxes[sel.match(/data-setup="(\w+)"/)?.[1] ?? ''] ?? wasQS(sel);
    typeIn('brief', 'Make it rain.');
    click({ name: 'c-2' }); await sleep(60);
    doc.querySelector = wasQS;
    // THE BOX IS THE SCENE'S BRIEF (Seth, 2026-11-01): one field for what the next scene is, where a
    // steer box asked the same thing beside it and the brief was dropped on asking again.
    const asked = POSTED.filter((p: any) => p.url === '/api/chapter/propose').at(-1)?.body;
    assert.deepStrictEqual([asked?.brief, asked?.steer], ['Make it rain.', undefined],
      'SETUP-BRIEF: what the next scene is goes with the ask as its brief, and there is no steer beside it');
    let side = html('sideBody');
    assert.match(side, /data-setup="brief"[^>]*>Make it rain\.<\/textarea>/, '  and the box still holds it');
    assert.doesNotMatch(side, /data-setup="steer"/, '  and no second box asks the same thing');
    assert.match(side, /data-setup="title" value="The Rust Year"/, 'SETUP-AGAIN: a new direction replaces the name Anansi gave before');
    assert.match(side, /By the end the debt has to be called in/, '  and where it heads');
    assert.doesNotMatch(side, /How Anansi said it opened before/, '  and how it opens');
    doc.querySelector = (sel: string) => boxes[sel.match(/data-setup="(\w+)"/)?.[1] ?? ''] ?? wasQS(sel);
    typeIn('note', 'Where I want it to go, typed by me, long enough to count.');
    click({ name: 'c-2' }); await sleep(60);
    doc.querySelector = wasQS;
    side = html('sideBody');
    assert.match(side, /Where I want it to go, typed by me/, 'SETUP-KEEPS-TYPED: a box the writer typed in is kept');
  } finally { doc.querySelector = wasQS; }
}
ok('asked again with a direction, the setup takes the new answer and keeps what the writer typed');

// ---- #66. THE NAME PROPOSED FOR THE NEXT CHAPTER LANDS ON THE NEXT CHAPTER.
//
// "The Lands Between" chapter 6 was found titled with a name that read like chapter 7's proposal.
// A stateful fake of the four chapter routes, so a close really opens a new chapter and a save
// really lands on the chapter it names; everything else falls through to the canned server.
{
  const canned = (globalThis as any).fetch;
  const chs: any[] = STORY.chapters.map((c: any) => ({ ...c }));
  const viewAt = (focus?: string | null) => ({ ...STORY, chapters: chs.map((c) => ({ ...c })),
    currentChapter: { ...(chs.find((c) => c.id === focus) ?? chs.at(-1)) } });
  (globalThis as any).fetch = async (url: string, init?: any) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    const reply = (o: any) => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o) });
    if (url.startsWith('/api/story?')) {
      return reply(viewAt(new URLSearchParams(url.split('?')[1]).get('chapter')));
    }
    if (url === '/api/chapter/end') {
      POSTED.push({ url, body });
      const open = chs.at(-1); open.status = 'closed';
      // #92. The hem's suggestion for the next scene arrives on the scene's card; here it has
      // already arrived, which is the case where it could land on the wrong scene.
      open.hem = { state: 'done', passes: {}, keptSummary: false, outOfDate: false, overflow: [],
        suggestion: { title: "The Fell Omen's Tale",
          note: 'By the end the omen has to be read aloud, and someone has to believe it.', opens: '' } };
      chs.push({ id: `c-${chs.length + 1}`, index: chs.length + 1, title: `Chapter ${chs.length + 1}`,
        summary: null, authorsNote: null, opensWith: null, status: 'open', coversThrough: null,
        summaryStale: false, keepWhole: false, hem: null });
      return reply({ closed: open.id, ...viewAt() });
    }
    if (url === '/api/chapter/propose') {
      POSTED.push({ url, body });
      return reply({ chapterId: body.chapterId, title: "The Fell Omen's Tale",
        note: 'By the end the omen has to be read aloud, and someone has to believe it.', opens: '' });
    }
    if (url === '/api/chapter') {
      POSTED.push({ url, body });
      const c = chs.find((x) => x.id === body.chapterId);
      if (c && body.chapter.title !== undefined) c.title = body.chapter.title;
      if (c && body.chapter.authorsNote !== undefined) c.authorsNote = body.chapter.authorsNote;
      return reply(viewAt(body.chapterId));
    }
    return canned(url, init);
  };
  const settle = () => sleep(40);
  const titleOf = (id: string) => chs.find((c) => c.id === id)?.title;

  click({ open: 's-1' }); await settle();
  // Close c-2 ('The Envoy'). Its hem suggests a name for c-3, and Set up the next scene shows it in
  // c-3's boxes.
  click({ endchapter: '1' }); await settle(); await settle();
  click({ panel: 'setup' }); click({ setupstep: 'premise' }); await settle();
  assert.match(html('sideBody'), /data-setup="title" value="The Fell Omen&#39;s Tale"/,
    "Set up the next scene shows the hem's suggestion in the boxes of the scene it opened");
  // The writer looks back at the chapter that just closed, and saves setup THERE. The suggestion is
  // for c-3; the screen now reads c-2.
  click({ chapter: 'c-2' }); await settle();
  click({ panel: 'setup' }); await settle();
  click({ setupstep: 'premise' }); await settle();
  assert.doesNotMatch(html('sideBody'), /Fell Omen/,
    "the closed chapter's setup does not show the name proposed for the next one");
  click({ savesetup: '1' }); await settle();
  assert.strictEqual(titleOf('c-2'), 'The Envoy',
    'the chapter that closed keeps its own title after the next one is named');
  // Back to the chapter being written, where the proposal was for.
  click({ chapter: 'c-3' }); await settle();
  click({ panel: 'setup' }); await settle();
  click({ setupstep: 'premise' }); await settle();
  click({ savesetup: '1' }); await settle();
  assert.strictEqual(titleOf('c-3'), "The Fell Omen's Tale",
    'and the chapter that opened gets the name proposed for it');
  // START WRITING LANDS ON THE PAGE (usability walkthrough, 2026-10-30): it opened What he reads,
  // a drawer of token counts over the scene the writer had just said they wanted to write.
  assert.ok(nodes.get('side').hidden, 'SETUP-LANDS: Start writing shuts the drawer and leaves the page');
  (globalThis as any).fetch = canned;
  ok('a name proposed for the next chapter lands on the next chapter, not the one that closed');
}

// ---- THE DOOR TO THE HEM IS NOT THE HEM (usability walkthrough, 2026-10-30). This scene's door and
// the gold button inside the drawer it opens both said "Hem this scene", so the door read as the act.
// The door says what the drawer will show, and the check reads BOTH sides: the door says "See how it
// was hemmed" exactly when the drawer behind it has no Hem button.
{
  const settle = () => sleep(40);
  const wasChapters = STORY.chapters, wasCurrent = STORY.currentChapter;
  const door = () => html('sideBody').match(/data-ritual="1">([^<]*)</)?.[1] ?? '';
  const behind = async () => { click({ ritual: '1' }); await settle(); return /data-endchapter="1"/.test(html('sideBody')); };
  try {
    click({ open: 's-1' }); await settle();
    click({ panel: 'chapter' }); await settle();
    assert.strictEqual(door(), 'Hem this scene&hellip;', 'HEM-DOOR: an open scene\'s door says the hem is behind it');
    assert.ok(await behind(), '  and the drawer behind it has the Hem button');
    // The scene on screen is closed and has prose: the drawer reports on it.
    STORY.chapters = STORY.chapters.map((c: any) => ({ ...c, status: 'closed' }));
    STORY.currentChapter = { ...wasCurrent, status: 'closed' };
    click({ open: 's-1' }); await settle();
    click({ panel: 'chapter' }); await settle();
    assert.strictEqual(door(), 'See how it was hemmed', 'HEM-DOOR: a hemmed scene\'s door says it shows the hem');
    assert.ok(!(await behind()), '  and the drawer behind it has no Hem button');
    // A fresh scene just opened by a hem, nothing written: the drawer reports on the one before it.
    const c3 = { id: 'c-door3', index: 3, title: 'Scene 3', summary: null, authorsNote: null, opensWith: null,
      status: 'open', coversThrough: null, summaryStale: false, keepWhole: false };
    STORY.chapters = [...wasChapters.map((c: any) => ({ ...c, status: 'closed' })), c3];
    STORY.currentChapter = { ...c3 };
    click({ open: 's-1' }); await settle();
    click({ panel: 'chapter' }); await settle();
    assert.strictEqual(door(), 'See how it was hemmed', 'HEM-DOOR: on an empty new scene the door goes to the last hem');
    assert.ok(!(await behind()), '  and that is what the drawer shows');
  } finally {
    STORY.chapters = wasChapters; STORY.currentChapter = wasCurrent;
  }
  click({ open: 's-1' }); await settle();
  ok('the door to the hem says what is behind it, and the drawer agrees (usability walkthrough, 2026-10-30)');
}

// ---- #126 · ONE POCKET PANEL. ＋ in the thread's header opens it to add; a row on the Pockets tab
// opens it on that pocket. Two tabs, Write it and Ask Anansi; Cancel and Save at its foot.
{
  const wait = () => sleep(40);
  click({ open: 's-1' }); await wait();
  click({ panel: 'threads' }); click({ entry: 'e-1' }); await wait();
  const head = html('sideHead');
  assert.match(head, /data-pocketnew="e-1"/, 'PANEL-PLUS: the header has a ＋ for a new pocket');
  // AND THE EDITOR'S HEADER (Seth, 2026-11-03): ＋ beside Done, and no add link left in the Pockets tab.
  click({ cardview: 'form' }); click({ cardtab: 'rooms' }); await wait();
  assert.match(html('sideHead'), /data-pocketnew="e-1"[\s\S]*data-alterdone/, 'ALTER-PLUS: the editor has ＋ before Done');
  assert.doesNotMatch(html('sideBody'), /data-pocketnew=/, 'ALTER-PLUS: and the Pockets tab has no add link of its own');
  click({ alterdone: '1' }); await wait();
  const { MARK } = await import('../web/model.js');
  assert.doesNotMatch(MARK.tidy, /C6 5 8 8 10\.5 6\.5/, 'PANEL-BROOM: the wavy Tidy mark is gone');
  assert.match(MARK.tidy, /M15\.4 3\.2/, 'PANEL-BROOM: Tidy is the broom');
  click({ pocketnew: 'e-1' }); await wait();
  const add = html('pocketPanel');
  assert.match(add, /role="dialog"/, 'PANEL-ADD: ＋ opens the panel');
  // ONE SCREEN (2026-11-02): the fields, then Ask Anansi as one row under them, not a second tab.
  assert.doesNotMatch(add, /data-pockettab=/, 'PANEL-ADD: no Write it / Ask Anansi tabs');
  assert.match(add, /id="pk-body"[\s\S]*id="pk-steer"[\s\S]*data-pocketask="write"/,
    'PANEL-ADD: the fields, then the ask row under them');
  assert.match(add, /data-pocketkind="voice"/, 'PANEL-ADD: adding offers the kinds');
  assert.match(add, /data-pocketsave="1"[^>]*>Add</, 'ADD-POCKET: a new pocket is added by Add');
  assert.doesNotMatch(add, />Save</, '  and there is no Save');
  assert.doesNotMatch(add, /data-pocketkind="facts"/, 'PANEL-ADD: and not Always true, which every thread has');
  assert.doesNotMatch(add, /data-pocketdel=/, 'PANEL-ADD: nothing to remove yet');
  // ALTER'S LOOK (Seth, 2026-11-02: "the edit screen for pockets should match the normal screen for
  // threads"), full screen still: Cancel and the Save pill at the top, Alter's tab chips and name.
  assert.match(add, /class="pkbar"[^>]*>\s*<button data-pocketx="1" class="headback"[\s\S]*?<button data-pocketsave="1" class="headsave"/,
    'POCKET-LOOK: Cancel and Save are the bar at the top, as Alter\'s');
  assert.doesNotMatch(add, /pkfoot/, '  and not big buttons at the foot');
  assert.match(add, /<input class="field altname" id="pk-name"/, '  and its name is Alter\'s name field');
  click({ pocketx: '1' }); await wait();
  click({ cardview: 'form' }); await wait();
  assert.match(html('sideBody'), /<button class="tabchip" data-cardtab=/, '  the same chips Alter draws');
  click({ alterdone: '1' }); await wait();
  assert.doesNotMatch(html('pocketPanel'), /role="dialog"/, 'PANEL-ADD: Cancel shuts it');
  ok('＋ in the header opens the pocket panel to add, and Tidy is a broom');

  // #134 · THE READ FACE draws the same eye on each pocket, and Wear on an outfit.
  const face = html('sideBody');
  assert.match(face, /data-pocketeye="a-off" data-look="eyeshut" data-reach="word"/, 'POCKET-EYE-READ: the read face draws the pocket eye');
  assert.doesNotMatch(face, /data-addonon=/, '  and no On / Off words');
  // THE POCKETS TAB IS A LIST: a row is the name, a line of the text and the switch; no editors.
  click({ cardview: 'form' }); click({ cardtab: 'rooms' }); await wait();
  const form = html('sideBody');
  const pane = form.split(/<div class="pane"/).find((p) => /data-editroom=/.test(p)) ?? '';
  assert.match(pane, /data-editroom="a-on"[\s\S]*How she sounds[\s\S]*Flat, unhurried\./, 'PANEL-LIST: a row has its name and its line');
  // #134 · A POCKET'S SWITCH IS THE THREAD'S EYE: an On pocket the open eye, an On a word one asleep
  // the shut eye (`a-off` has a wake word, so it is On a word; the fixture's rows have no activation,
  // as a row from before the column does not), and an outfit keeps its Wear.
  assert.match(pane, /data-pocketeye="a-off" data-look="eyeshut" data-reach="word"/, 'POCKET-EYE-LIST: and its eye, asleep on a word');
  assert.match(pane, /data-pocketeye="a-on" data-look="eye" data-reach="on"/, 'POCKET-EYE-ON: an On pocket has the open eye');
  assert.doesNotMatch(pane, /data-addonon=/, 'POCKET-EYE-NO-WORDS: no On / Off words left');
  assert.doesNotMatch(pane, /data-pocketeye="o-/, 'POCKET-EYE-OUTFIT: and no eye on an outfit');
  assert.match(pane, /data-wear="e-1:o-hung"/, 'PANEL-LIST: an outfit keeps its wearing in the list');
  assert.doesNotMatch(pane, /data-an=|data-ab=|data-ak=|data-ofn=|data-ofb=/, 'PANEL-LIST: no inline editors');
  assert.doesNotMatch(form, /Add to this thread|data-newroom=/, 'PANEL-LIST: no add tray');
  // A ROW OPENS THE PANEL ON THAT POCKET.
  click({ editroom: 'a-off' }); await wait();
  const edit = html('pocketPanel');
  assert.match(edit, /id="pk-name" value="What she wants"/, 'PANEL-EDIT: a row opens the panel on it');
  assert.match(edit, /id="pk-keys" value="home"/, 'PANEL-EDIT: with its wake words');
  assert.match(edit, /data-pocketdel="a-off"/, 'PANEL-EDIT: and Remove, inside the panel');
  assert.doesNotMatch(edit, /data-pocketkind=/, 'PANEL-EDIT: its kind is not offered again');
  click({ pocketx: '1' }); await wait();
  ok('the Pockets tab is a list, and a row opens the panel on that pocket');

  // WHAT IS TYPED SURVIVES A REPAINT. A POCKET THAT EXISTS SAVES AS YOU TYPE (ADR 0004, pass three):
  // a pause writes a draft, which keeps no revision and stales nothing, and Done sends the last write
  // with the text the panel opened on, so the revision and the staling are worked out once, against it.
  click({ editroom: 'a-off' }); await wait();
  assert.doesNotMatch(html('pocketPanel'), /data-pocketsave|>Save</, 'POCKET-NO-SAVE: an open pocket has no Save');
  assert.match(html('pocketPanel'), /data-pocketundo="1"[\s\S]*data-pocketdone="1"/, 'POCKET-FOOT: Undo my changes and Done in its foot');
  const addons = () => POSTED.filter((x) => x.url === '/api/addon').map((x) => x.body);
  POSTED.length = 0;
  typeIn('pk-body', 'To go home, and not say so.'); typeIn('pk-keys', 'home, harbour');
  click({ cardtab: 'rooms' }); await wait();   // any press that repaints
  assert.match(html('pocketPanel'), />To go home, and not say so\.<\/textarea>/, 'PANEL-REPAINT: the typed text is drawn back');
  assert.deepStrictEqual(addons(), [], 'POCKET-PAUSE: nothing is written while the typing goes on');
  await sleep(1000);
  const typed = { id: 'a-off', slot: 'interiority', name: 'What she wants', body: 'To go home, and not say so.', keys: ['home', 'harbour'] };
  assert.deepStrictEqual(addons(), [{ storyId: 's-1', entryId: 'e-1', addon: typed, draft: true }],
    'POCKET-DRAFT: the pause writes the pocket as a draft');
  click({ pocketdone: '1' }); await wait();
  assert.deepStrictEqual(addons().slice(1), [{ storyId: 's-1', entryId: 'e-1', addon: typed,
    opened: { name: 'What she wants', body: 'To go home.' } }], 'POCKET-DONE: Done sends the last write, naming what it opened on');
  assert.doesNotMatch(html('pocketPanel'), /role="dialog"/, 'POCKET-DONE: and shuts the panel');
  // UNDO MY CHANGES after a draft: the opening text, as the last write, so nothing is kept or staled.
  click({ editroom: 'a-off' }); await wait();
  POSTED.length = 0;
  typeIn('pk-body', 'Somewhere else.'); await sleep(1000);
  click({ pocketundo: '1' }); await wait();
  assert.notStrictEqual(html('pocketPanel'), '', 'POCKET-UNDO-ASKS: Undo my changes with a change typed asks first');
  click({ pocketundo: '1' }); await wait();
  assert.deepStrictEqual(addons().map((b: any) => [b.addon.body, b.draft ?? null, b.opened?.body ?? null]),
    [['Somewhere else.', true, null], ['To go home.', null, 'To go home.']],
    'POCKET-UNDO: the second press writes back what it opened on, as the last write');
  assert.doesNotMatch(html('pocketPanel'), /role="dialog"/, '  and shuts it');
  // A HIDDEN TAB sends the last write too, with or without a pause still waiting.
  click({ editroom: 'a-off' }); await wait();
  POSTED.length = 0;
  typeIn('pk-body', 'Home, by spring.');
  const doc = (globalThis as any).document;
  doc.visibilityState = 'hidden';
  try { (listeners.visibilitychange ?? []).forEach((f: Function) => f({})); await wait(); } finally { doc.visibilityState = 'visible'; }
  assert.deepStrictEqual(addons().map((b: any) => [b.addon.body, b.draft ?? null, b.opened?.body ?? null]),
    [['Home, by spring.', true, null], ['Home, by spring.', null, 'To go home.']],
    'POCKET-HIDDEN: a hidden tab writes the pause, then the last write');
  // Done after: the last write was sent and nothing has changed since, so nothing more.
  POSTED.length = 0;
  click({ pocketdone: '1' }); await wait();
  assert.deepStrictEqual(addons(), [], 'POCKET-HIDDEN-ONCE: and Done after it sends nothing more');
  // A NEW ONE: the kind chosen, no id.
  click({ pocketnew: 'e-1' }); click({ pocketkind: 'voice' });
  typeIn('pk-name', 'At court'); typeIn('pk-body', 'Formal, and slower.');
  POSTED.length = 0;
  click({ pocketsave: '1' }); await wait();
  assert.deepStrictEqual(POSTED.find((x) => x.url === '/api/addon')?.body.addon,
    { slot: 'voice', name: 'At court', body: 'Formal, and slower.', keys: [] }, 'PANEL-SAVE: a new one carries its kind and no id');
  // Seth, 2026-11-03: "a new pocket should automatically be on". The server switches it on; the
  // panel says so, and asks for nothing more.
  assert.match(String(nodes.get('toast').textContent), /^Added, and on\.$/, 'PANEL-NEW-ON: a new pocket is said to be on');
  ok('the pocket panel keeps what is typed through a repaint; one that exists saves as you type, and a new one is sent by its press');

  // REMOVE ASKS TWICE.
  click({ editroom: 'a-off' }); await wait();
  POSTED.length = 0;
  click({ pocketdel: 'a-off' }); await wait();
  assert.ok(!POSTED.some((x) => x.method === 'DELETE'), 'PANEL-REMOVE: the first press only asks');
  click({ pocketdel: 'a-off' }); await wait();
  assert.deepStrictEqual(POSTED.find((x) => x.method === 'DELETE')?.body, { storyId: 's-1', id: 'a-off' },
    'PANEL-REMOVE: the second removes it');
  ok('Remove in the pocket panel asks twice');

  // ASK ANANSI ON A POCKET THAT EXISTS: his rewrite is a diff, and Use this puts it in the box.
  click({ editroom: 'a-on' }); await wait();
  typeIn('pk-steer', 'colder');
  stubInvent = { addon: { slot: 'voice', name: 'How she sounds', body: 'Flat, and colder.', keys: [] } };
  POSTED.length = 0;
  try { click({ pocketask: 'write' }); await wait(); } finally { stubInvent = null; }
  const asked = POSTED.find((x) => x.url === '/api/invent')?.body;
  assert.strictEqual(asked?.kind, 'voice', 'PANEL-ASK: the existing invent call, for this kind');
  assert.match(String(asked?.direction), /^colder[\s\S]*Flat, unhurried\./, 'PANEL-ASK: with the steer and the text it rewrites');
  const offer = html('pocketPanel');
  assert.match(offer, /<div class="diff" data-view="now">[\s\S]*<ins>[^<]*colder[\s\S]*<del>[^<]*unhurried/, 'PANEL-ASK: his rewrite is a diff against the text');
  assert.match(offer, /data-pocketuse="1"/, 'PANEL-ASK: with Use this');
  click({ pocketuse: '1' }); await wait();
  assert.match(html('pocketPanel'), /id="pk-body"[^>]*>Flat, and colder\.<\/textarea>/, 'PANEL-USE: Use this fills the box');
  assert.match(html('pocketPanel'), /id="pk-steer"/, 'PANEL-USE: with the ask row still under it');
  click({ pocketundo: '1' }); click({ pocketundo: '1' }); await wait();
  ok("Ask Anansi's rewrite of a pocket is a diff, and Use this fills the box");

  // #134 · THE EYE'S TAP, as a thread card's: On a word → On → Off → On a word, each posted, with the
  // state's name for a moment. The fake answers each write with STORY, so the pocket is moved here
  // between taps to the state the last tap posted.
  const posted = () => POSTED.filter((x) => x.url === '/api/addon/on').map((x) => x.body.activation);
  POSTED.length = 0;
  click({ pocketeye: 'a-off' }); await wait();
  assert.match(html('sideBody'), /data-pocketeye="a-off"[^>]*>[\s\S]*?<span class="eyetip" role="status">On</,
    'POCKET-EYE-TAP: a tap names the new state for a moment, as a thread card\'s');
  STORY.entries[0].addons[1] = { ...STORY.entries[0].addons[1], activation: 'always_on', active: true };
  click({ pocketeye: 'a-off' }); await wait();
  STORY.entries[0].addons[1] = { ...STORY.entries[0].addons[1], activation: 'off', active: false };
  click({ pocketeye: 'a-off' }); await wait();
  assert.deepStrictEqual(posted(), ['always_on', 'off', 'triggered'], 'POCKET-EYE-CYCLE: a tap posts the next state, as a thread card');
  assert.deepStrictEqual(POSTED.find((x) => x.url === '/api/addon/on')?.body, { storyId: 's-1', id: 'a-off', activation: 'always_on' },
    '  naming the pocket and its activation');
  STORY.entries[0].addons[1] = { ...STORY.entries[0].addons[1], activation: undefined, active: false };
  ok('a pocket\'s eye cycles Off, On a word, On, as a thread card');

  // #137 · MERGE TWO POCKETS (spec #132). From a pocket that exists: pick another pocket of the thread
  // (not Always true), the box opens with both texts joined and the ask row, and Merge, the one gold
  // press, sends the box. The answer has the other pocket gone; the panel opens on the one that stays.
  const e1 = STORY.entries[0] as any, hadPockets = e1.addons;
  e1.addons = [...hadPockets, { id: 'a-facts', slot: 'facts', name: 'facts', body: 'An envoy.', keys: [], active: true }];
  const AFTER = { ...STORY, entries: [{ ...e1, addons: [{ ...hadPockets[1], body: 'To go home; flat about it.', keys: ['home'],
    activation: 'always_on', active: true }, e1.addons[2]] }, ...STORY.entries.slice(1)] };
  const canned = (globalThis as any).fetch;
  (globalThis as any).fetch = async (url: string, init?: any) => {
    if (url !== '/api/addon/merge') return canned(url, init);
    POSTED.push({ url, body: JSON.parse(init.body) });
    const o = { kept: 'a-off', ...AFTER };
    return { ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o) } as any;
  };
  const pmerged = () => POSTED.filter((x) => x.url === '/api/addon/merge');
  try {
    click({ pocketnew: 'e-1' }); await wait();
    assert.doesNotMatch(html('pocketPanel'), /data-pocketmerge=/, 'POCKET-MERGE-NEW: a pocket being added has no merge');
    click({ pocketx: '1' }); await wait();
    click({ editroom: 'a-off' }); await wait();
    assert.match(html('pocketPanel'), /data-pocketmerge="1"[^>]*>Merge with another pocket&hellip;/, 'POCKET-MERGE-OFFER: a pocket that exists offers Merge with another pocket');
    typeIn('pk-body', 'To go home, quietly.');
    POSTED.length = 0;
    click({ pocketmerge: '1' }); await wait();
    assert.deepStrictEqual(POSTED.filter((x) => x.url === '/api/addon').map((x) => [x.body.addon.body, x.body.opened?.body ?? null]),
      [['To go home, quietly.', 'To go home.']], 'POCKET-MERGE-FLUSH: what was typed in the pocket is written first, as its last write');
    const pick = html('pocketPanel');
    for (const id of ['a-on', 'o-worn', 'o-hung']) assert.match(pick, new RegExp(`data-pocketmergewith="${id}"`), `POCKET-MERGE-PICK: ${id} can be picked`);
    assert.doesNotMatch(pick, /data-pocketmergewith="a-off"/, 'POCKET-MERGE-PICK: not the pocket itself');
    assert.doesNotMatch(pick, /data-pocketmergewith="a-facts"/, 'POCKET-MERGE-PICK: nor Always true');
    assert.doesNotMatch(pick, /data-pocketmergego=/, '  and no Merge until one is picked');
    click({ pocketmergewith: 'a-on' }); await wait();
    const box = html('pocketPanel');
    assert.match(box, /id="pm-body"[^>]*>To go home, quietly\.\n\nFlat, unhurried\.<\/textarea>/, 'POCKET-MERGE-JOINED: the box holds both texts joined');
    assert.match(box, /id="pk-steer"[\s\S]*data-pocketask="write"/, 'POCKET-MERGE-ASK: with the Ask Anansi row');
    assert.match(box, /<button data-pocketmergego="1" class="headsave">Merge</, 'POCKET-MERGE-GOLD: Merge is the one gold press');
    assert.doesNotMatch(box, /data-pocketdone=|data-pocketsave=/, '  and the only one');
    // ANANSI ON THE JOINED TEXT: his version against the box, and Use this puts it in the box.
    stubInvent = { addon: { slot: 'interiority', name: 'What she wants', body: 'To go home, flatly.', keys: [] } };
    POSTED.length = 0;
    try { click({ pocketask: 'write' }); await wait(); } finally { stubInvent = null; }
    assert.match(String(POSTED.find((x) => x.url === '/api/invent')?.body.direction), /To go home, quietly\.\n\nFlat, unhurried\./,
      'POCKET-MERGE-ASK: Anansi is asked about the joined text');
    click({ pocketuse: '1' }); await wait();
    assert.match(html('pocketPanel'), /id="pm-body"[^>]*>To go home, flatly\.<\/textarea>/, 'POCKET-MERGE-USE: Use this fills the merge box');
    typeIn('pm-body', 'To go home; flat about it.');
    click({ cardtab: 'rooms' }); await wait();   // any press that repaints
    assert.match(html('pocketPanel'), /id="pm-body"[^>]*>To go home; flat about it\.<\/textarea>/, 'POCKET-MERGE-REPAINT: what is typed survives a repaint');
    // CANCEL goes back to the pocket and writes nothing.
    click({ pocketmergex: '1' }); click({ pocketmergex: '1' }); await wait();
    assert.match(html('pocketPanel'), /id="pk-body"[^>]*>To go home, quietly\.<\/textarea>[\s\S]*data-pocketmerge="1"/, 'POCKET-MERGE-CANCEL: Cancel goes back to the pocket');
    assert.strictEqual(pmerged().length, 0, '  and writes nothing');
    // THE WHOLE WAY, with an edit, to Merge.
    click({ pocketmerge: '1' }); await wait(); click({ pocketmergewith: 'a-on' }); await wait();
    typeIn('pm-body', '  ');
    click({ pocketmergego: '1' }); await wait();
    assert.strictEqual(pmerged().length, 0, 'POCKET-MERGE-EMPTY: an empty box is not sent');
    typeIn('pm-body', 'To go home; flat about it.');
    click({ pocketmergego: '1' }); await wait();
    assert.deepStrictEqual(pmerged().at(-1)?.body, { storyId: 's-1', keepId: 'a-off', goneId: 'a-on', body: 'To go home; flat about it.' },
      'POCKET-MERGE-GO: Merge sends the open pocket, the other and the box');
    assert.match(html('pocketPanel'), /id="pk-body"[^>]*>To go home; flat about it\.<\/textarea>/, 'POCKET-MERGE-KEPT: the panel opens on the pocket that stays, with its text');
    assert.doesNotMatch(html('pocketPanel'), /id="pm-body"/, '  out of the merge');
    assert.doesNotMatch(html('sideBody'), /data-pocketeye="a-on"/, 'POCKET-MERGE-GONE: the other pocket is gone from the thread');
    // The answer has it On, where the tale drew it On a word: the face draws what the server kept.
    assert.match(html('sideBody'), /data-pocketeye="a-off" data-look="eye" data-reach="on"/, 'POCKET-MERGE-ACTIVATION: the kept one shows the activation the server kept');
    click({ pocketdone: '1' }); await wait();
  } finally { (globalThis as any).fetch = canned; e1.addons = hadPockets; }
  ok('two pockets of a thread merge: pick the other, edit the joined text with Ask Anansi, Merge or Cancel');
  click({ cardview: null }); click({ backentry: '1' });
}

// ---- #127 · ADR 0011. THE STRINGS SCREEN IS A LIST OF THE TALE'S STRING POCKETS, a row opens the pocket
// panel on one, and the Workbench sews a chalked string in and ties off or lets go one that is open.
{
  const wait = () => sleep(40);
  const was = { tale: (STORY as any).taleThread, strings: STORY.strings, proposals: STORY.proposals };
  const LETTER = { id: 'st-1', slot: 'promise', name: 'The letter he has not opened', body: 'Sent by his brother',
    keys: [], active: true, status: null, fromChapter: 1, owedBy: 4 };
  const RING = { id: 'st-2', slot: 'question', name: 'Who took the ring', body: 'Nobody says.',
    keys: [], active: false, status: 'paid', fromChapter: 1, owedBy: null };
  (STORY as any).taleThread = { id: 'e-tale', title: 'The tale', body: 'Six houses.', entryType: 'tale', keys: [],
    states: [], nowStateId: null, addons: [{ id: 'tf', slot: 'facts', name: 'facts', body: 'A port.', keys: [], active: true },
      LETTER, RING] };
  STORY.strings = [
    { id: 'st-1', title: LETTER.name, body: LETTER.body, fromChapter: 1, owedBy: 4, status: 'open', summoned: true, kind: 'promise' },
    { id: 'st-2', title: RING.name, body: RING.body, fromChapter: 1, owedBy: null, status: 'paid', summoned: false, kind: 'question' },
  ] as any;
  try {
    click({ open: 's-1' }); await wait();
    click({ panel: 'strings' }); await wait();
    const list = html('sideBody');
    assert.match(list, /data-editroom="st-1"[^>]*>[\s\S]*?The letter he has not opened[\s\S]*?Sent by his brother/,
      "STRINGS-LIST: a row is the string's name and a line of it, and opens it");
    assert.match(list, /data-pocketeye="st-1" data-look="eye" data-reach="on"/, "STRINGS-LIST: with the pocket's own eye, open");
    assert.match(list, /data-editroom="st-2"[\s\S]*?tied off[\s\S]*?data-pocketeye="st-2" data-look="eyeoff" data-reach="off"/,
      'STRINGS-MARK: one tied off says so, and its eye is off: opening it is how it reopens');
    // A string has no wake words, so its eye goes Off and On only.
    POSTED.length = 0; click({ pocketeye: 'st-2' }); await wait();
    assert.deepStrictEqual(POSTED.find((x) => x.url === '/api/addon/on')?.body, { storyId: 's-1', id: 'st-2', activation: 'always_on' },
      'STRINGS-EYE: an off string\'s eye opens it, with no On a word between');
    assert.doesNotMatch(list, /data-summon=|data-delstring=|data-stringstatus=/, '  no Summon, no inline remove, no status buttons');
    assert.doesNotMatch(list, /Chalked by Anansi|data-pbody="pr-2"/, 'STRINGS-CHALK: a chalked string is on the Workbench, not here');
    ok("the Strings screen lists the tale's string pockets, each with its switch, its mark, and a way into it");

    click({ editroom: 'st-1' }); await wait();
    const p = html('pocketPanel');
    assert.match(p, /id="pk-name" value="The letter he has not opened"/, 'STRINGS-PANEL: a row opens the pocket panel on the string');
    assert.match(p, /Promise &middot; The tale/, "  as a promise of the tale's thread");
    assert.doesNotMatch(p, /id="pk-keys"/, '  with no wake words: a string is sent while it is on');
    assert.match(p, /id="pk-owed"[^>]*value="4"/, '  with the scene a promise is owed by');
    typeIn('pk-body', 'Sent by his brother, and sealed.');
    POSTED.length = 0;
    click({ pocketdone: '1' }); await wait();
    assert.deepStrictEqual(POSTED.find((x) => x.url === '/api/addon')?.body, { storyId: 's-1', entryId: 'e-tale',
      addon: { id: 'st-1', slot: 'promise', name: 'The letter he has not opened', body: 'Sent by his brother, and sealed.', keys: [],
        owedBy: 4 }, opened: { name: 'The letter he has not opened', body: 'Sent by his brother' } },
      "STRINGS-SAVE: Done sends the string as a pocket of the tale's thread");
    ok('a string opens in the pocket panel, and Done sends it as a pocket of the tale');

    // Seth, 2026-10-28: "I can't change a string's status or what it's for, like a promise." Open, the
    // panel shows the string's kind as two pills and where it stands as four choices.
    click({ editroom: 'st-1' }); await wait();
    const open1 = html('pocketPanel');
    assert.match(open1, /data-pocketkind="promise"[^>]*aria-pressed="true"[^>]*>Promise</,
      'STRINGS-PANEL-KIND: an open string shows its kind, a promise');
    assert.match(open1, /data-pocketkind="question"[^>]*aria-pressed="false"[^>]*>Open question</, '  beside open question');
    const stands = [...open1.matchAll(/data-stringstatus="st-1:(\w+)"[^>]*aria-pressed="(\w+)"[^>]*>([^<]+)</g)]
      .map((m) => [m[1], m[2], m[3]]);
    assert.deepStrictEqual(stands, [['play', 'true', 'In play'], ['aside', 'false', 'Set aside'],
      ['paid', 'false', 'Tied off'], ['dropped', 'false', 'Let go']],
      `STRINGS-PANEL-STAND: four choices, In play chosen (${JSON.stringify(stands)})`);
    // Each choice sends what the Workbench's buttons send, through the same door.
    for (const [stand, status, summoned] of [['aside', 'open', false], ['paid', 'paid', false],
      ['dropped', 'dropped', false], ['play', 'open', true]] as const) {
      POSTED.length = 0;
      click({ stringstatus: `st-1:${stand}` }); await wait();
      const b = POSTED.find((x) => x.url === '/api/string')?.body;
      assert.deepStrictEqual([b?.string?.id, b?.string?.status, b?.string?.summoned], ['st-1', status, summoned],
        `STRINGS-PANEL-STAND: ${stand} is ${status}, ${summoned ? 'on' : 'off'}`);
    }
    assert.ok(html('pocketPanel').includes('role="dialog"'), '  and the panel stays open');
    // WITH TYPING IN THE PANEL: the choice carries what is typed, as a draft (ADR 0004, pass three),
    // and not the string as the tale was last drawn, which would write the typing away.
    typeIn('pk-body', 'Sent by his brother, unread.'); await sleep(1000);
    POSTED.length = 0;
    click({ stringstatus: 'st-1:play' }); await wait();
    const typedStand = POSTED.find((x) => x.url === '/api/string')?.body;
    assert.deepStrictEqual([typedStand?.string?.body, typedStand?.draft], ['Sent by his brother, unread.', true],
      'STRINGS-STAND-TYPED: a choice made while typing carries the typing, as a draft');
    typeIn('pk-body', 'Sent by his brother'); await sleep(1000);
    // The Workbench's switch goes through the same door.
    POSTED.length = 0;
    click({ summon: 'st-1' }); await wait();
    const sm = POSTED.find((x) => x.url === '/api/string')?.body?.string;
    assert.deepStrictEqual([sm?.status, sm?.summoned], ['open', false], 'STRINGS-SUMMON: set aside from the Workbench is the same');
    // Made an open question: it is owed by no scene, and Save sends the new kind.
    click({ pocketkind: 'question' }); await wait();
    assert.match(html('pocketPanel'), /data-pocketkind="question"[^>]*aria-pressed="true"/, 'STRINGS-PANEL-KIND: question is chosen');
    assert.doesNotMatch(html('pocketPanel'), /id="pk-owed"/, '  and the owed by box goes');
    POSTED.length = 0;
    click({ pocketdone: '1' }); await wait();
    assert.deepStrictEqual(POSTED.find((x) => x.url === '/api/addon')?.body?.addon,
      { id: 'st-1', slot: 'question', name: 'The letter he has not opened', body: 'Sent by his brother', keys: [] },
      'STRINGS-PANEL-KIND-SAVE: Done sends the string as an open question, with no owed by');
    // One tied off shows so.
    click({ editroom: 'st-2' }); await wait();
    const open2 = html('pocketPanel');
    assert.match(open2, /data-pocketkind="question"[^>]*aria-pressed="true"/, '  a question shows as one');
    assert.match(open2, /data-stringstatus="st-2:paid"[^>]*aria-pressed="true"/, 'STRINGS-PANEL-STAND: one tied off shows Tied off');
    click({ pocketx: '1' }); await wait();
    ok("an open string shows its kind and where it stands, and both can be changed from the panel");

    // #128 · ASK ANANSI FOR A STRING: his rewrite of one the tale has is a diff, with Use this.
    click({ editroom: 'st-1' }); await wait();
    const askTab = html('pocketPanel');
    assert.match(askTab, /data-pocketask="write"[^>]*>Anansi edits/, 'STRINGS-ASK: a string has Ask Anansi, as a rewrite');
    assert.doesNotMatch(askTab, /data-pocketask="web"/, '  and no Look it up online: a string is the tale\'s own');
    typeIn('pk-steer', 'sealed');
    stubInvent = { addon: { slot: 'promise', name: LETTER.name, body: 'Sent by his brother, sealed in black wax.', keys: [] } };
    POSTED.length = 0;
    try { click({ pocketask: 'write' }); await wait(); } finally { stubInvent = null; }
    const sent = POSTED.find((x) => x.url === '/api/invent')?.body;
    assert.strictEqual(sent?.kind, 'promise', 'STRINGS-ASK: the invent call, for the string\'s kind');
    assert.strictEqual(sent?.entryId, 'e-tale', "  on the tale's thread");
    assert.match(String(sent?.direction), /^sealed[\s\S]*Sent by his brother/, '  with the steer and the text it rewrites');
    const offer = html('pocketPanel');
    assert.match(offer, /<div class="diff" data-view="now">[\s\S]*<ins>[^<]*black wax/, 'STRINGS-ASK-DIFF: his rewrite is a diff against the string');
    click({ pocketuse: '1' }); await wait();
    assert.match(html('pocketPanel'), /id="pk-body"[^>]*>Sent by his brother, sealed in black wax\.<\/textarea>/,
      'STRINGS-ASK-USE: Use this fills the box');
    click({ pocketx: '1' }); click({ pocketx: '1' }); await wait();
    ok("Ask Anansi rewrites a string as a diff, and Use this fills the box");

    click({ panel: 'waiting' }); await wait();
    const w = html('sideBody');
    assert.match(w, /A string, chalked[\s\S]*?The debt nobody has called in[\s\S]*?data-deckall="accept" data-ids="pr-2"[^>]*>Sew it in/,
      'STRINGS-SEW: a chalked string is a Workbench card with Sew it in');
    // A string you already have is never dealt again (Seth, 2026-10-29): it waits on the Workbench only
    // while chalked or while a hem has an update for it.
    assert.doesNotMatch(w, /data-deckkind="string"/, 'STRINGS-NOT-DEALT: an open string you have is not a Workbench card');
    ok('the Workbench sews a chalked string in, and does not deal back a string you already have');

    // WHERE A STRING STANDS NOW, as a hem chalks it: a diff against the string's text, sewn in its place.
    const { diffHTML } = await import('../web/model.js');
    STORY.proposals = [...was.proposals, { id: 'pr-s', entryId: 'e-tale', title: 'The tale', body: 'Sealed, and burned unread.',
      entryType: 'tale', field: 'promise', target: 'st-1', pocket: LETTER.name, kind: 'memory', keys: [],
      delta: 'where the promise stands', chapterId: 'c-2' }] as any;
    click({ open: 's-1' }); await wait();
    click({ panel: 'waiting' }); await wait();
    const side = html('sideBody'), at = side.indexOf('data-deckdiff="pr-s"');
    const row = side.slice(at, side.indexOf('data-deckcard=', at) >>> 0);
    assert.ok(side.includes(`data-deckdiff="pr-s">${diffHTML(LETTER.body, 'Sealed, and burned unread.')}`),
      "STRINGS-DIFF: where a string stands now is a diff against its text");
    assert.match(row, /replaces its text from\s+the next scene on; the old version is kept/, '  and says it replaces it');
    assert.doesNotMatch(row, /Sew in beside it|data-decide="replace" data-id="pr-s"/, '  with no beside-it to choose');
    ok("where a string stands now is a diff on the Workbench, sewn in its string's place");
  } finally {
    (STORY as any).taleThread = was.tale; STORY.strings = was.strings; STORY.proposals = was.proposals;
    click({ open: 's-1' }); await wait();
  }
}

// ---- #128 · ＋ ON STRINGS OPENS THE POCKET PANEL ON THE TALE'S THREAD, with promise or open question to
// choose, and Ask Anansi writes one. The old add form is gone. A tale with no thread of its own yet
// still adds one: Save names no thread, and the server makes the tale's.
{
  const wait = () => sleep(40);
  const was = { tale: (STORY as any).taleThread, strings: STORY.strings };
  try {
    (STORY as any).taleThread = null; STORY.strings = [] as any;
    click({ open: 's-1' }); await wait();
    click({ panel: 'strings' }); await wait();
    assert.match(html('sideHead'), /data-stringnew="1"/, 'STRINGS-PLUS: the Strings screen has a ＋');
    const list = html('sideBody');
    assert.doesNotMatch(list, /data-newstring=|data-st2=/, 'STRINGS-NO-FORM: the old add form is gone');
    click({ stringnew: '1' }); await wait();
    const add = html('pocketPanel');
    assert.match(add, /role="dialog"/, 'STRINGS-PLUS: ＋ opens the pocket panel');
    assert.match(add, /New string &middot; The tale/, "  on the tale's thread");
    const kinds = [...add.matchAll(/data-pocketkind="(\w+)"/g)].map((m) => m[1]);
    assert.deepStrictEqual(kinds, ['promise', 'question'], `STRINGS-KINDS: promise or open question, and nothing else (${kinds})`);
    assert.match(add, /data-pocketkind="question"[^>]*>Open question</, '  named as the writer reads them');
    click({ pocketkind: 'question' }); await wait();
    assert.doesNotMatch(html('pocketPanel'), /id="pk-owed"/, 'STRINGS-OWED: an open question is owed by no scene');

    // ASK ANANSI TO WRITE ONE: his answer fills Write it.
    assert.match(html('pocketPanel'), /data-pocketask="write"[^>]*>Anansi writes/, 'STRINGS-ASK-NEW: Anansi writes');
    stubInvent = { addon: { slot: 'question', name: 'Who opened the sluice', body: 'Nobody will say.', keys: [] } };
    POSTED.length = 0;
    try { click({ pocketask: 'write' }); await wait(); } finally { stubInvent = null; }
    const sent = POSTED.find((x) => x.url === '/api/invent')?.body;
    assert.strictEqual(sent?.kind, 'question', 'STRINGS-ASK-NEW: asks for the kind chosen');
    assert.ok(!sent?.entryId, '  naming no thread, as the tale has none yet');
    assert.match(html('pocketPanel'), /id="pk-name" value="Who opened the sluice"/, '  and his answer fills Write it');

    POSTED.length = 0;
    click({ pocketsave: '1' }); await wait();
    assert.deepStrictEqual(POSTED.find((x) => x.url === '/api/addon')?.body, { storyId: 's-1', entryId: null,
      addon: { slot: 'question', name: 'Who opened the sluice', body: 'Nobody will say.', keys: [],
        fromChapter: STORY.currentChapter.index } },
      "STRINGS-SAVE-NEW: Save sends a new string, set up this scene, for the tale's thread the server makes");
    ok("＋ on Strings opens the pocket panel with promise or open question, and Ask Anansi writes one");

    // A PROMISE, on a tale that has its thread: the thread is named, and owed by rides with it.
    (STORY as any).taleThread = { id: 'e-tale', title: 'The tale', body: '', entryType: 'tale', keys: [], states: [],
      nowStateId: null, addons: [] };
    click({ open: 's-1' }); await wait();
    click({ panel: 'strings' }); await wait();
    click({ stringnew: '1' }); click({ pocketkind: 'promise' }); await wait();
    typeIn('pk-name', 'The mill debt'); typeIn('pk-body', 'Owed to the weir-warden since spring.'); typeIn('pk-owed', '5');
    POSTED.length = 0;
    click({ pocketsave: '1' }); await wait();
    assert.deepStrictEqual(POSTED.find((x) => x.url === '/api/addon')?.body, { storyId: 's-1', entryId: 'e-tale',
      addon: { slot: 'promise', name: 'The mill debt', body: 'Owed to the weir-warden since spring.', keys: [],
        owedBy: 5, fromChapter: STORY.currentChapter.index } },
      "STRINGS-SAVE-PROMISE: a promise is saved on the tale's thread with the scene it is owed by");
    ok("a new promise is saved on the tale's thread with the scene it is owed by");
  } finally {
    (STORY as any).taleThread = was.tale; STORY.strings = was.strings;
    click({ open: 's-1' }); await wait();
  }
}

// ---- #129 · THE TALE'S OWN THREAD PAGE LISTS ITS STRINGS: Promises and Open questions under Rules, each
// row the one the Strings screen draws, the open ones before those tied off or let go.
{
  const wait = () => sleep(40);
  const was = { tale: (STORY as any).taleThread, strings: STORY.strings };
  const st = (id: string, kind: string, title: string, status: string, summoned: boolean) =>
    ({ id, title, body: `${title}, the line`, fromChapter: 1, owedBy: null, status, summoned, kind });
  const pockets = (STORY as any).taleThread = { id: 'e-tale', title: 'The tale', body: '', entryType: 'tale', keys: [],
    states: [], nowStateId: null, addons: [] };
  STORY.strings = [
    st('p-done', 'promise', 'The paid debt', 'paid', false),
    st('p-on', 'promise', 'The letter', 'open', true),
    st('p-off', 'promise', 'The ferry fare', 'open', false),
    st('q-on', 'question', 'Who opened the sluice', 'open', true),
    st('q-gone', 'question', 'Where the dog went', 'dropped', false),
  ] as any;
  pockets.addons = STORY.strings.map((x: any) => ({ id: x.id, slot: x.kind, name: x.title, body: x.body, keys: [] }));
  // The one row of a string, as a page draws it: from its pocketrow div to the end of its switch.
  const rowOf = (page: string, id: string) => page.match(new RegExp(
    `<div class="pocketrow[^"]*">\\s*<button class="pocketopen" data-editroom="${id}"[\\s\\S]*?</button></div>`))?.[0];
  try {
    click({ open: 's-1' }); await wait();
    click({ storytab: 'thread' }); click({ panel: 'story' }); await wait();
    const page = html('sideBody').match(/data-group="thread"[\s\S]*/)?.[0] ?? '';
    const rules = page.indexOf('>Rules'), prom = page.indexOf('>Promises'), ques = page.indexOf('>Open questions');
    assert.ok(rules > 0 && prom > rules && ques > prom, `TALE-STRINGS: Promises, then Open questions, under Rules (${rules}, ${prom}, ${ques})`);
    const promises = page.slice(prom, ques), questions = page.slice(ques);
    const order = (s: string) => [...s.matchAll(/data-editroom="([\w-]+)"/g)].map((m) => m[1]);
    assert.deepStrictEqual(order(promises), ['p-on', 'p-off', 'p-done'],
      'TALE-PROMISES: the promises, in play then set aside, then the one tied off');
    assert.match(promises.slice(promises.indexOf('data-editroom="p-off"')), /Tied off or let go[\s\S]*data-editroom="p-done"/,
      '  under its own heading');
    assert.deepStrictEqual(order(questions).filter((x) => x.startsWith('q')), ['q-on', 'q-gone'],
      'TALE-QUESTIONS: the open questions, the one let go after the open one');
    click({ editroom: 'p-off' }); await wait();
    assert.match(html('pocketPanel'), /id="pk-name" value="The ferry fare"/, 'TALE-OPEN: a row opens the pocket panel on it');
    click({ pocketx: '1' }); await wait();

    // ONE ＋ FOR THE TAB (Seth, 2026-10-30), not one per kind: the panel offers the kind.
    assert.doesNotMatch(page, /data-stringnew=/, 'TALE-ONE-PLUS: no ＋ per kind on the tab');
    // Strings' own ＋ still adds a string: the two kinds of string, not a rule or your own.
    click({ stringnew: '1' }); await wait();
    const add = html('pocketPanel');
    assert.match(add, /New string &middot; The tale/, 'STRINGS-PLUS: the Strings ＋ adds a string');
    assert.deepStrictEqual([...add.matchAll(/data-pocketkind="(\w+)"/g)].map((m) => m[1]), ['promise', 'question'],
      '  offering the two kinds of string only');
    click({ pocketx: '1' }); await wait();
    click({ panel: 'strings' }); await wait();
    const screen = html('sideBody');
    for (const id of ['p-on', 'p-done', 'q-gone']) {
      assert.ok(rowOf(screen, id), `TALE-SAME: the Strings screen draws a row for ${id}`);
      assert.strictEqual(rowOf(page, id), rowOf(screen, id), `TALE-SAME: the tale page draws ${id} as the Strings screen does`);
    }
    ok("the tale's own thread lists its promises and open questions, each row the Strings screen's, the open ones first");
  } finally {
    (STORY as any).taleThread = was.tale; STORY.strings = was.strings;
    click({ open: 's-1' }); await wait();
  }
}

// ---- THE PAGE'S FOOT HAS ROOM ENOUGH TO PUT THE NEW HEADER AT THE TOP, ON A SHORT PAGE TOO. The room
// was counted from `scrollHeight`, which is never less than the screen, so a page shorter than the
// screen got too little: measured on a 390px screen, the header wanted 438px of scroll, the page had
// 309, and the header sat at 167px instead of 128px (2026-10-28).
{
  const { roomBelow } = await import('../web/model.js');
  const scrolls = (content: number, client: number, room: number) => Math.max(content + room, client) - client;
  // A short page: 400px of prose on a 700px screen, the header wanting 438px of scroll.
  assert.strictEqual(scrolls(400, 700, roomBelow(438, 400, 700)), 438, 'a short page can scroll the header to the top');
  // What the old count gave it: scrollHeight (700 here) in place of the real 400.
  assert.ok(scrolls(400, 700, roomBelow(438, 700, 700)) < 438, 'and the scrollHeight count could not (the check sees the bug)');
  // A long page: nothing to add when it can already reach.
  assert.strictEqual(roomBelow(438, 2000, 700), 0, 'a long page gets no room');
  // Part way: 900px of prose on 700 scrolls 200; 438 wants 238 more.
  assert.strictEqual(roomBelow(438, 900, 700), 238, 'a page part way there gets the difference');
  assert.strictEqual(roomBelow(438.2, 900, 700), 239, 'rounded up, so the header is never a pixel short');
  ok('the room under a short page is counted from its content, not from scrollHeight');
}

// ---- WRITING INLINE: THE OLD VERSION STAYS HIDDEN WHILE THE NEW ONE IS WRITTEN, THROUGH A REPAINT.
// It was hidden by a class put on the DOM at the press, and a repaint rebuilds #col, so the old
// version came back under the new one being written. passageHTML draws it hidden now, from state.
//
// The rest of this file runs with the veil on, and the switch is read once, at load. So the app is
// loaded a SECOND time here with the veil off, and the first copy's listeners are taken away, so a
// press reaches only the second. LAST IN THE FILE for that reason: nothing after it can be sure
// which copy it is driving.
{
  const wait = (ms = 40) => sleep(ms);
  stored.set('anansi.veil', '0');
  for (const k of Object.keys(listeners)) listeners[k] = [];
  // And the window's (popstate), which the harness keeps so Back can be pressed.
  for (const k of Object.keys(winListeners)) winListeners[k] = [];
  // The harness's one #ghost answers as the inline passage (see the reweave-quiet check above).
  (document as any).getElementById('ghost').classList.contains = (c: string) => c === 'inlive';
  await import('../web/app.js?inline');
  await wait(30);
  click({ open: 's-1' }); await wait();
  const blockOf = (id: string) => html('col').match(new RegExp(
    `<div class="block[^"]*"[^>]*>(?:(?!<div class="block)[\\s\\S])*?data-edit="${id}"`))?.[0] ?? '';
  assert.ok(blockOf('p-5'), 'the last passage is drawn');
  assert.doesNotMatch(blockOf('p-5'), /rerolling-out/, 'and is not hidden before any press');
  let open = () => {};
  try {
    // A REWEAVE THAT LANDS. Held before its first word, so the stretch while it is written can be looked at.
    streamGate = new Promise<void>((r) => { open = r; });
    click({ re: 'p-5' }); click({ re: 'p-5' }); await wait();
    assert.match(blockOf('p-5'), /class="block[^"]* rerolling-out/, 'the old version is drawn hidden while the new one is written');
    click({ rerollx: '1' }); await wait();
    assert.match(blockOf('p-5'), /class="block[^"]* rerolling-out/, 'and a repaint draws it hidden again');
    open(); streamGate = null; await wait(200);
    assert.ok(blockOf('p-5'), 'the new version lands');
    assert.doesNotMatch(blockOf('p-5'), /rerolling-out/, 'and is not hidden');

    // A REWEAVE THAT FAILS. The old version comes back (unghost), and stays back through a repaint.
    stubRefuse = { error: 'The model fell over.' };
    streamGate = new Promise<void>((r) => { open = r; });
    click({ re: 'p-5' }); click({ re: 'p-5' }); await wait();
    assert.match(blockOf('p-5'), /rerolling-out/, 'hidden while the second one is written');
    open(); streamGate = null; await wait(200);
    click({ rerollx: '1' }); await wait();
    assert.doesNotMatch(blockOf('p-5'), /rerolling-out/, 'a failed reweave gives the old version back, and a repaint keeps it back');
    stubRefuse = null;

    // A REPAINT IN THE TAIL. The call is over and the page's copy of the book already holds the new
    // version, while its last words are still being written in. A new version is a new row with its
    // own id, and the old one is among its variants: hidden by the old id alone, a repaint here drew
    // the new version above the one still being written (seen in a browser at 390px, 2026-10-28).
    // The words are held by giving them somewhere to go and no frames to go there in.
    const gh = (document as any).getElementById('ghost');
    gh.querySelector = (s: string) => (s === '.veiltext' ? { closest: () => null, parentElement: null } : null);
    const p5 = (STORY.passages as any[]).find((p) => p.id === 'p-5');
    click({ re: 'p-5' }); click({ re: 'p-5' }); await wait();
    Object.assign(p5, { id: 'p-5b', variantIndex: 2, variants: [{ id: 'p-5', selected: false }, { id: 'p-5b', selected: true }] });
    await wait(200);
    click({ rerollx: '1' }); await wait();
    assert.ok(blockOf('p-5b'), 'the new version is in the page’s copy of the book');
    assert.match(blockOf('p-5b'), /class="block[^"]* rerolling-out/,
      'and a repaint while its last words are written draws it hidden, by the id it replaced');
  } finally {
    open(); streamGate = null; stubRefuse = null;
    const p5 = (STORY.passages as any[]).find((p) => p.id === 'p-5b');
    if (p5) Object.assign(p5, { id: 'p-5', variantIndex: 1, variants: [{ id: 'p-5', selected: true }] });
  }
  ok('writing inline, the replaced version is drawn hidden until the new one lands or fails, through a repaint');
}

// ---- MERGE TWO THREADS (Seth, 2026-10-29). The thread's More menu → pick the other thread → pick
// which stays → Anansi drafts → a full-screen review, each part against the kept thread's text and
// editable → Merge writes it. Cancel writes nothing.
{
  const wait = () => sleep(40);
  const canned = (globalThis as any).fetch;
  const { diffHTML } = await import('../web/model.js');
  const DRAFT = { keep: { id: 'e-2', title: 'The stair' }, gone: { id: 'e-1', title: 'Envoy Sereth' },
    kept: 'Kept unlit over lit: it is the more specific.',
    always: { was: 'A stair.', now: 'A stair with no landing.' },
    stands: { was: 'the lower stair: unlit', now: 'Unlit, and boarded over.' },
    pockets: [{ slot: 'atmosphere', name: 'Echo', body: 'Every step echoes.', target: 'a-st', merges: ['a-on'],
      was: 'Cold air.', wasName: 'Cold' }] };
  const AFTER = { ...STORY, entries: (STORY.entries as any[]).filter((e) => e.id !== 'e-1') };
  (globalThis as any).fetch = async (url: string, init?: any) => {
    if (url !== '/api/merge/draft' && url !== '/api/merge') return canned(url, init);
    POSTED.push({ url, body: JSON.parse(init.body) });
    const o = url === '/api/merge' ? { kept: 'e-2', ...AFTER } : DRAFT;
    return { ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o) } as any;
  };
  const merged = () => POSTED.filter((x) => x.url === '/api/merge');
  const panel = () => html('mergePanel');
  try {
    click({ open: 's-1' }); await wait();
    click({ panel: 'threads' }); click({ entry: 'e-1' }); await wait();
    click({ readmenu: '1' }); await wait();
    assert.match(html('sideBody'), /data-mergestart="e-1"[^>]*>Merge with another thread/, 'MERGE-MENU: the More menu has Merge with another thread');
    click({ mergestart: 'e-1' }); await wait();
    assert.match(panel(), /role="dialog"/, 'MERGE-PICK: it opens full screen');
    assert.match(panel(), /id="mg-q"/, 'MERGE-PICK: with a search');
    for (const id of ['e-2', 'e-took', 'e-fired']) assert.match(panel(), new RegExp(`data-mergewith="${id}"`), `MERGE-PICK: ${id} can be picked`);
    assert.doesNotMatch(panel(), /data-mergewith="e-1"/, 'MERGE-PICK: not the thread itself');
    assert.doesNotMatch(panel(), /data-mergewith="e-shared"/, 'MERGE-PICK: nor a thread the tale only follows');
    typeIn('mg-q', 'stair'); await wait();
    assert.match(panel(), /data-mergewith="e-2"/, 'MERGE-SEARCH: the search keeps what matches');
    assert.doesNotMatch(panel(), /data-mergewith="e-took"/, '  and drops what does not');
    click({ mergewith: 'e-2' }); await wait();
    assert.match(panel(), /data-mergekeep="e-1"/, 'MERGE-KEEP: either one can stay');
    assert.match(panel(), /data-mergekeep="e-2"/, '  the other too');
    assert.strictEqual(POSTED.filter((x) => x.url === '/api/merge/draft').length, 0, '  and nothing is asked yet');
    click({ mergekeep: 'e-2' }); await wait();
    assert.deepStrictEqual(POSTED.filter((x) => x.url === '/api/merge/draft').at(-1)?.body,
      { storyId: 's-1', keepId: 'e-2', goneId: 'e-1' }, 'MERGE-DRAFT: picking which stays asks Anansi for the draft');
    const review = panel();
    assert.ok(review.includes(diffHTML('A stair.', 'A stair with no landing.')), 'MERGE-REVIEW: Always true is shown against the kept text, as a diff');
    assert.ok(review.includes(diffHTML('the lower stair: unlit', 'Unlit, and boarded over.')), '  and where it stands');
    assert.ok(review.includes(diffHTML('Cold air.', 'Every step echoes.')), '  and each pocket');
    assert.match(review, /id="mg-always"[^>]*>A stair with no landing\.<\/textarea>/, 'MERGE-REVIEW: each part is in a box to edit');
    assert.match(review, /Kept unlit over lit/, 'MERGE-REVIEW: what disagreed and which was kept is said');
    assert.match(review, /data-mergego="1"/, 'MERGE-REVIEW: with Merge');
    assert.strictEqual(merged().length, 0, '  and nothing written yet');
    // CANCEL WRITES NOTHING.
    click({ mergex: '1' }); await wait();
    assert.doesNotMatch(panel(), /role="dialog"/, 'MERGE-CANCEL: Cancel shuts it');
    assert.strictEqual(merged().length, 0, 'MERGE-CANCEL: and writes nothing');
    // THE WHOLE WAY, with an edit, to Merge.
    click({ readmenu: '1' }); click({ mergestart: 'e-1' }); click({ mergewith: 'e-2' }); click({ mergekeep: 'e-2' }); await wait();
    typeIn('mg-always', 'A stair with no landing, and no rail.'); typeIn('mg-pk-0', 'Every step echoes twice.');
    click({ readmenu: '1' }); await wait();   // any press that repaints
    assert.match(panel(), /id="mg-always"[^>]*>A stair with no landing, and no rail\.<\/textarea>/, 'MERGE-REPAINT: what is typed survives a repaint');
    click({ mergego: '1' }); await wait();
    assert.deepStrictEqual(merged().at(-1)?.body, { storyId: 's-1', keepId: 'e-2', goneId: 'e-1',
      always: 'A stair with no landing, and no rail.', stands: 'Unlit, and boarded over.',
      pockets: [{ slot: 'atmosphere', name: 'Echo', body: 'Every step echoes twice.', target: 'a-st', merges: ['a-on'] }] },
      'MERGE-GO: Merge sends the parts as the writer left them');
    assert.doesNotMatch(panel(), /role="dialog"/, 'MERGE-GO: and shuts');
    assert.match(html('sideHead') + html('sideBody'), /The stair/, 'MERGE-GO: the thread that stayed is open');
  } finally { (globalThis as any).fetch = canned; }
  ok('Merge with another thread: pick it, pick which stays, review the draft as diffs, then Merge or Cancel');
}

// TALK IS KEPT, AND AN ANSWER'S PROMPT CAN BE COPIED (Seth, 2026-10-30). The page sends the session the
// first answer named with every later question; Past talks lists this tale's talks, opens one to
// carry on, and deletes one in two presses; New talk starts again and keeps the old one; Copy prompt
// copies exactly the messages the answer came back with, as plain text.
const SESSIONS = [{ id: 'ts-old', title: 'Who is Marek, really', createdAt: Date.now() - 864e5, updatedAt: Date.now() - 3 * 36e5, turns: 4 },
                  { id: 'ts-older', title: 'The debt', createdAt: Date.now() - 3 * 864e5, updatedAt: Date.now() - 2 * 864e5, turns: 2 }];
const OLD_TURNS = [{ you: true, text: 'Who is Marek, really?', at: 1 }, { text: 'A man who owes.', at: 2 },
                   { you: true, text: 'Owes whom?', at: 3 }, { text: 'The house.', at: 4 }];
const PROMPT = [{ role: 'system', content: 'You are Anansi. The tale: a debt.' },
                { role: 'user', content: 'Who is Marek?' }, { role: 'assistant', content: 'A man who owes.' },
                { role: 'user', content: 'And the house?' }];
const sessionFetch = (canned: any, got: string[]) => async (url: string, init?: any) => {
  if (!init?.body) got.push(url);
  if (/^\/api\/(spark\/)?talk\/sessions/.test(url)) return { ok: true, json: async () => ({ sessions: SESSIONS }) };
  if (/^\/api\/(spark\/)?talk\/session\?/.test(url)) return { ok: true, json: async () => ({ id: 'ts-old', title: 'Who is Marek, really', turns: OLD_TURNS }) };
  if (/^\/api\/(spark\/)?talk\/session\/remove/.test(url)) {
    POSTED.push({ url, body: JSON.parse(init.body) });
    return { ok: true, json: async () => ({ sessions: SESSIONS.slice(1) }) };
  }
  return canned(url, init);
};
const withClipboard = (writeText: ((t: string) => Promise<void>) | null) => {
  if (writeText) Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText }, configurable: true });
  else delete (globalThis.navigator as any).clipboard;
};
{
  const canned = (globalThis as any).fetch;
  const got: string[] = [];
  (globalThis as any).fetch = sessionFetch(canned, got);
  const talks = () => POSTED.filter((p: any) => p.url === '/api/talk');
  const send = async (said: string) => { (document as any).getElementById('input').value = said; click({ send: '1' }); await sleep(80); };
  const copied: string[] = [];
  try {
    click({ open: 's-1' }); await sleep(40);
    click({ panel: 'anansi' }); await sleep(30);
    POSTED.length = 0;
    stubTalk = { reply: 'A man who owes.', seconds: 1, tokens: 10, sessionId: 'ts-new', prompt: PROMPT };
    await send('Who is Marek?');
    assert.strictEqual(talks()[0].body.sessionId, undefined, 'TALK-SESSION-FIRST: the first question names no session');
    await send('And the house?');
    assert.strictEqual(talks()[1].body.sessionId, 'ts-new', 'TALK-SESSION-ON: the next one names the session the answer gave');

    // COPY PROMPT, on each answer that came back with one.
    const presses = [...html('dockCol').matchAll(/data-copyprompt="(\d+)"[^>]*>\s*Copy prompt/g)].map((m) => m[1]);
    assert.deepStrictEqual(presses, ['1', '3'], `COPY-PROMPT-PRESS: each answer has Copy prompt, and no question does (${presses})`);
    withClipboard(async (t) => { copied.push(t); });
    click({ copyprompt: '3' }); await sleep(20);
    assert.strictEqual(copied[0], 'SYSTEM:\nYou are Anansi. The tale: a debt.\n\nWRITER:\nWho is Marek?\n\nANANSI:\nA man who owes.\n\nWRITER:\nAnd the house?',
      'COPY-PROMPT-TEXT: exactly the messages sent, as plain text');
    assert.match(String(nodes.get('toast').textContent), /Prompt copied/, 'COPY-PROMPT-TOAST: and says so');
    withClipboard(null);
    click({ copyprompt: '3' }); await sleep(20);
    assert.match(String(nodes.get('toast').textContent), /Could not reach the clipboard/, 'COPY-PROMPT-NO-CLIPBOARD: without a clipboard it says so');

    // PAST TALKS: this tale's, newest first, with title and when.
    got.length = 0;
    click({ talkpast: '1' }); await sleep(30);
    assert.ok(got.includes('/api/talk/sessions?story=s-1'), `TALK-PAST-ASKS: this tale's talks are asked for (${got})`);
    const list = html('dockCol');
    assert.ok(list.indexOf('Who is Marek, really') >= 0 && list.indexOf('Who is Marek, really') < list.indexOf('The debt'),
      'TALK-PAST-LIST: each talk by its title, newest first');
    assert.match(list, /3 hours ago/, 'TALK-PAST-LIST: with when it was last added to');
    assert.doesNotMatch(list, /A man who owes/, '  in place of the conversation');

    // OPEN ONE: its turns, and the next question carries it on.
    click({ talkopen: 'ts-old' }); await sleep(30);
    assert.ok(html('dockCol').includes('Owes whom?') && html('dockCol').includes('The house.'), 'TALK-OPEN: its turns are on the page');
    assert.doesNotMatch(html('dockCol'), /data-copyprompt/, 'TALK-OPEN: an opened talk has no prompt to copy: prompts are not kept');
    stubTalk = { reply: 'Yes.', seconds: 1, tokens: 10, sessionId: 'ts-old' };
    await send('Go on');
    assert.strictEqual(talks().at(-1).body.sessionId, 'ts-old', 'TALK-OPEN-ON: the next question carries the opened talk on');
    assert.deepStrictEqual(talks().at(-1).body.turns.map((t: any) => t.text), OLD_TURNS.map((t) => t.text), '  with its turns');

    // NEW TALK: the page starts again, and the next question names no session.
    click({ clearchat: '1' }); await sleep(20);
    assert.doesNotMatch(html('dockCol'), /Owes whom\?/, 'TALK-NEW: New talk clears the page');
    stubTalk = { reply: 'Fresh.', seconds: 1, tokens: 10, sessionId: 'ts-fresh' };
    await send('Start again');
    assert.strictEqual(talks().at(-1).body.sessionId, undefined, 'TALK-NEW: and the next question starts a new talk');

    // DELETE: two presses.
    click({ talkpast: '1' }); await sleep(30);
    const removes = () => POSTED.filter((p: any) => p.url === '/api/talk/session/remove');
    click({ talkdel: 'ts-old' }); await sleep(20);
    assert.strictEqual(removes().length, 0, 'TALK-DELETE-ARMED: one press deletes nothing');
    assert.match(String(nodes.get('toast').textContent), /Press again/, '  and asks for a second');
    click({ talkdel: 'ts-old' }); await sleep(30);
    assert.deepStrictEqual(removes().map((p: any) => p.body), [{ storyId: 's-1', session: 'ts-old' }], 'TALK-DELETE: the second press deletes it');
    assert.doesNotMatch(html('dockCol'), /Who is Marek, really/, 'TALK-DELETE: and it leaves the list');
  } finally { (globalThis as any).fetch = canned; stubTalk = null; withClipboard(null); click({ dockwrite: '1' }); await sleep(20); }
}
ok('Talk names its session, Copy prompt copies what was sent, and Past talks opens, starts anew and deletes');

// AND THE SETUP TALK, beside a tale being set up.
{
  const doc = (globalThis as any).document;
  const canned = (globalThis as any).fetch;
  const got: string[] = [];
  const settle = async (re: RegExp, id = 'page') => { for (let i = 0; i < 40 && !re.test(html(id)); i++) await sleep(25); };
  const sparkTalks = () => POSTED.filter((p) => p.url === '/api/spark/talk');
  const ask = async (said: string) => { (document as any).getElementById('input').value = said; click({ send: '1' }); await sleep(80); return sparkTalks().at(-1); };
  const copied: string[] = [];
  click({ railview: 'workspace' }); await sleep(30);
  click({ nav: 'create' }); await sleep(30);
  doc.getElementById = (id: string) => id === 'idea' ? { value: 'Six houses, one winter.' } : (nodes.get(id) ?? el(id));
  try { click({ spark: '1' }); await settle(/data-sp="premise"/); }
  finally { doc.getElementById = (id: string) => nodes.get(id) ?? el(id); }
  (globalThis as any).fetch = sessionFetch(canned, got);
  try {
    click({ panel: 'anansi' }); await settle(/id="input"/, 'dockCol');
    POSTED.length = 0;
    stubSparkTalk = { reply: 'Start with the frost.', seconds: 1, sessionId: 'ts-setup', prompt: PROMPT };
    assert.strictEqual((await ask('How should it begin?')).body.sessionId, undefined, 'SETUP-SESSION-FIRST: the first question names no session');
    assert.strictEqual((await ask('And then?')).body.sessionId, 'ts-setup', 'SETUP-SESSION-ON: the next names the one the answer gave');
    withClipboard(async (t) => { copied.push(t); });
    assert.match(html('dockCol'), /data-copyprompt="3"/, 'SETUP-COPY-PROMPT: each setup answer has Copy prompt');
    click({ copyprompt: '3' }); await sleep(20);
    assert.strictEqual(copied[0], 'SYSTEM:\nYou are Anansi. The tale: a debt.\n\nWRITER:\nWho is Marek?\n\nANANSI:\nA man who owes.\n\nWRITER:\nAnd the house?',
      'SETUP-COPY-PROMPT: exactly what was sent');
    click({ talkpast: '1' }); await sleep(30);
    assert.ok(got.includes('/api/spark/talk/sessions'), `SETUP-PAST: the setup talks are asked for (${got})`);
    assert.match(html('dockCol'), /Who is Marek, really/, 'SETUP-PAST: and listed');
    click({ talkopen: 'ts-old' }); await sleep(30);
    assert.match(html('dockCol'), /Owes whom\?/, 'SETUP-OPEN: one opens');
    assert.strictEqual((await ask('Go on')).body.sessionId, 'ts-old', 'SETUP-OPEN-ON: and is carried on');
    click({ talkpast: '1' }); await sleep(30);
    click({ talkdel: 'ts-old' }); await sleep(20);
    click({ talkdel: 'ts-old' }); await sleep(30);
    assert.deepStrictEqual(POSTED.filter((p: any) => p.url === '/api/spark/talk/session/remove').map((p: any) => p.body),
      [{ session: 'ts-old' }], 'SETUP-DELETE: two presses delete a setup talk');
  } finally {
    (globalThis as any).fetch = canned; stubSparkTalk = null; withClipboard(null);
    click({ dropSpark: '1' }); await sleep(30);
  }
}
ok('the setup Talk names its session, copies its prompt, and opens and deletes past setup talks');

// #100 · THE SETUP'S TALK IS THE FULL-SCREEN COMPOSER (Seth, 2026-10-30: "make sure the chat here
// matches the input full screen ui we've been using"). The same dock a tale has, full screen and Talk
// only: the conversation above the box, Back and Send either side of it, Talk's presses in the row
// above, and Back, Esc and the browser's Back all close it and leave the step as it was.
{
  const doc = (globalThis as any).document;
  const hist = (globalThis as any).history;
  const settle = async (re: RegExp, id = 'page') => { for (let i = 0; i < 40 && !re.test(html(id)); i++) await sleep(25); };
  const sparkTalks = () => POSTED.filter((p) => p.url === '/api/spark/talk');
  const dock = nodes.get('dock');
  // The stub's classList forgets; this one remembers, because `big` and `talking` ARE the look.
  const cls = new Set<string>();
  const wasClass = dock.classList;
  dock.classList = { toggle: (c: string, on: boolean) => { if (on) cls.add(c); else cls.delete(c); },
    add: (c: string) => cls.add(c), remove: (c: string) => cls.delete(c), contains: (c: string) => cls.has(c) };
  // A history that is a stack, and a Back that fires popstate after the press, as a browser's does.
  const was = { push: hist.pushState, replace: hist.replaceState, back: hist.back, state: hist.state };
  const stack: any[] = [null];
  hist.pushState = (st: any) => { stack.push(st); hist.state = st; };
  hist.replaceState = (st: any) => { stack[stack.length - 1] = st; hist.state = st; };
  hist.back = () => { if (stack.length > 1) stack.pop(); hist.state = stack.at(-1);
    setImmediate(() => (winListeners.popstate ?? []).forEach((f) => f({}))); };
  hist.state = null;
  const open = async () => { click({ panel: 'anansi' }); await settle(/id="input"/, 'dockCol'); };
  click({ railview: 'workspace' }); await sleep(30);
  click({ nav: 'create' }); await sleep(30);
  doc.getElementById = (id: string) => id === 'idea' ? { value: 'Six houses, one winter.' } : (nodes.get(id) ?? el(id));
  try { click({ spark: '1' }); await settle(/data-sp="premise"/); }
  finally { doc.getElementById = (id: string) => nodes.get(id) ?? el(id); }
  try {
    await open();
    assert.strictEqual(dock.hidden, false, 'SETUP-DOCK-FULL: Talk during setup is the composer');
    assert.ok(cls.has('big') && cls.has('talking') && !cls.has('folded'),
      `SETUP-DOCK-FULL: full screen and turned to Talk, as in a tale (${[...cls]})`);
    assert.strictEqual(nodes.get('side').hidden, true, 'SETUP-DOCK-FULL: and no drawer');
    const col = html('dockCol');
    assert.doesNotMatch(col, /id="modes"|data-modesel/, 'SETUP-DOCK-TALK-ONLY: no writing modes, there is no tale to write in');
    const at = ['id="talkthread"', 'id="talkhead"', 'id="input"', 'data-send="1"'].map((x) => col.indexOf(x));
    assert.ok(at.every((x, i) => x >= 0 && (i === 0 || x > at[i - 1])),
      `SETUP-DOCK-ORDER: the conversation, Talk's row, the box, then Send (${at})`);
    assert.match(col, /data-bigin="1" aria-pressed="true"[\s\S]*?Back</, 'SETUP-DOCK-BACK-PRESS: Back where the full-screen press is');
    const head = () => html('dockCol').slice(html('dockCol').indexOf('id="talkhead"'), html('dockCol').indexOf('id="inputRow"'));
    assert.match(head(), /data-websearch="1"/, 'SETUP-DOCK-HEAD: the search switch in Talk\'s row');
    assert.match(head(), /data-talkpast="1"/, 'SETUP-DOCK-HEAD: and Past talks');
    assert.doesNotMatch(head(), /data-dockwrite/, 'SETUP-DOCK-HEAD: and no Back to writing');
    assert.ok(stack.some((x) => x?.layer === 'setuptalk'), 'SETUP-DOCK-LAYER: opening it is a step in the history');

    // SEND, from the composer's box.
    stubSparkTalk = { reply: 'Begin at the gate.', seconds: 1 };
    POSTED.length = 0;
    nodes.get('input').value = 'Where should it begin?';
    click({ send: '1' });
    for (let i = 0; i < 40 && !sparkTalks().length; i++) await sleep(25);
    await sleep(40);
    assert.strictEqual(sparkTalks()[0]?.body.said, 'Where should it begin?', 'SETUP-DOCK-SEND: Send asks Anansi about the draft');
    assert.strictEqual(nodes.get('input').value, '', 'SETUP-DOCK-SEND: and empties the box');
    assert.match(html('dockCol'), /Begin at the gate\./, 'SETUP-DOCK-SEND: the answer lands above the box');
    assert.match(head(), /data-clearchat="1"/, 'SETUP-DOCK-HEAD: New talk, once there is a talk');
    assert.match(head(), /data-fillsetup="1"/, 'SETUP-DOCK-HEAD: and Fill in the tale');

    // THREE WAYS OUT, each leaving the step where it was and the talk kept for next time.
    click({ bigin: '1' }); await sleep(30);
    assert.strictEqual(dock.hidden, true, 'SETUP-DOCK-CLOSE: Back closes it');
    assert.match(html('page'), /data-sp="premise"/, 'SETUP-DOCK-CLOSE: onto the step it was opened from');
    await open();
    assert.match(html('dockCol'), /Begin at the gate\./, 'SETUP-DOCK-KEPT: opened again, the talk is still there');
    (listeners.keydown ?? []).forEach((f: Function) => f({ key: 'Escape', target: { closest: () => null }, preventDefault() {} }));
    await sleep(30);
    assert.strictEqual(dock.hidden, true, 'SETUP-DOCK-ESC: Esc closes it');
    await open();
    hist.back(); await sleep(30);
    assert.strictEqual(dock.hidden, true, 'SETUP-DOCK-BROWSER-BACK: the browser\'s Back closes it');
    assert.match(html('page'), /data-sp="premise"/, 'SETUP-DOCK-BROWSER-BACK: and the wizard stays');
  } finally {
    Object.assign(hist, { pushState: was.push, replaceState: was.replace, back: was.back, state: was.state });
    dock.classList = wasClass; stubSparkTalk = null;
    click({ dropSpark: '1' }); await sleep(30);
  }
}
ok('the setup Talk is the full-screen composer: the talk above the box, Back and Send, and Back, Esc and the browser close it');

// ---- ALTER SAVES AS YOU TYPE (ADR 0004, pass three; Seth, 2026-10-25: "Everything saves as you go.
// There is no Save button."). The passage's Alter box writes once the typing pauses, Done writes what
// is left and shuts it, and Cancel is Undo my changes: the passage as it was when Alter opened.
{
  click({ open: 's-1' }); await sleep(40);
  const canned = (globalThis as any).fetch;
  let refuse = false;
  (globalThis as any).fetch = async (url: string, init?: any) => {
    if (url === '/api/passage' && refuse) {
      POSTED.push({ url, body: JSON.parse(init.body), method: init.method });
      return { ok: false, status: 500, json: async () => ({ error: 'the disk is full' }) };
    }
    return canned(url, init);
  };
  const edits = () => POSTED.filter((x) => x.url === '/api/passage').map((x) => x.body);
  const typeAlter = (value: string) => (listeners.input ?? []).forEach((f: Function) =>
    f({ target: { id: '', dataset: { editbox: '1' }, value, matches: (q: string) => q === '[data-editbox]', closest: () => null } }));
  // The canned view is the fixture itself, so the page's copy of the passage is the fixture's: put back after.
  const P2 = STORY.passages.find((x: any) => x.id === 'p-2') as any, ORIGINAL = P2.body;
  try {
    click({ ed: 'p-2' }); await sleep(20);
    const col = html('col');
    assert.match(col, /data-editbox="1"/, 'ALTER-OPEN: Alter opens its box');
    assert.doesNotMatch(col, /data-editsave|btnword">Save</, 'ALTER-NO-SAVE: and there is no Save on it');
    assert.match(col, /data-editundo="1"[\s\S]*?Undo my changes/, 'ALTER-UNDO-SHOWN: Cancel is Undo my changes');
    assert.match(col, /data-editdone="p-2"[\s\S]*?Done/, 'ALTER-DONE-SHOWN: and the main press is Done');
    POSTED.length = 0;
    typeAlter('"You came alone, then."');
    await sleep(400);
    assert.deepStrictEqual(edits(), [], 'ALTER-PAUSE: nothing is written while the typing goes on');
    await sleep(700);
    assert.deepStrictEqual(edits(), [{ storyId: 's-1', id: 'p-2', body: '"You came alone, then."', again: false }],
      'ALTER-AUTOSAVE: the pause writes what was typed, keeping what was there');
    typeAlter('"You came alone, then. Good."');
    await sleep(1000);
    assert.deepStrictEqual(edits()[1], { storyId: 's-1', id: 'p-2', body: '"You came alone, then. Good."', again: true },
      'ALTER-AGAIN-SENT: the next pause is the same Alter, and keeps no second row');
    // THE LAST KEYSTROKE: typed and Done pressed inside the pause, it is written before the box shuts.
    typeAlter('"You came alone, then. Good. Sit."');
    click({ editdone: 'p-2' }); await sleep(40);
    assert.strictEqual(edits().at(-1)?.body, '"You came alone, then. Good. Sit."', 'ALTER-DONE-FLUSH: Done writes what the pause had not');
    assert.strictEqual(edits().length, 3, '  once');
    assert.doesNotMatch(html('col'), /data-editbox/, 'ALTER-DONE: and shuts the box');
    await sleep(1000);
    assert.strictEqual(edits().length, 3, 'ALTER-DONE-ONCE: and the pause that was waiting does not write it again');

    // UNDO MY CHANGES puts back what was there when it opened, and saves that. Two presses, since it
    // throws typing away.
    POSTED.length = 0;
    const opened = P2.body;
    assert.strictEqual(opened, '"You came alone, then. Good. Sit."', 'ALTER-KEPT: what Done wrote is the passage now');
    click({ ed: 'p-2' }); await sleep(20);
    typeAlter('"Wrong."');
    await sleep(1000);
    click({ editundo: '1' }); await sleep(20);
    assert.match(html('col'), /data-editbox/, 'ALTER-UNDO-ASKS: the first press of Undo asks');
    click({ editundo: '1' }); await sleep(40);
    assert.deepStrictEqual(edits().map((b: any) => [b.body, b.again]), [['"Wrong."', false], [opened, true]],
      'ALTER-UNDO: the second puts the passage back as it was, as the same Alter');
    assert.doesNotMatch(html('col'), /data-editbox/, '  and shuts the box');

    // A REFUSED WRITE SAYS SO, and Done does not shut what could not be saved.
    POSTED.length = 0; refuse = true;
    click({ ed: 'p-2' }); await sleep(20);
    typeAlter('"Lost?"');
    await sleep(1000);
    assert.match(String(nodes.get('toast').textContent), /Not saved\. the disk is full/, 'ALTER-REFUSED: a refused write is said');
    click({ editdone: 'p-2' }); await sleep(40);
    assert.match(html('col'), /data-editbox/, 'ALTER-REFUSED-OPEN: and Done keeps the box open with the words in it');
    assert.strictEqual(edits().length, 2, '  having tried again');
    refuse = false;
    click({ editdone: 'p-2' }); await sleep(40);
    assert.strictEqual(edits().at(-1)?.body, '"Lost?"', 'ALTER-REFUSED-RETRY: once the server takes it, Done writes it');
    assert.doesNotMatch(html('col'), /data-editbox/, '  and shuts');
  } finally {
    (globalThis as any).fetch = canned; refuse = false; P2.body = ORIGINAL;
  }
}
ok('Alter saves as you type: a pause writes, Done writes the rest, Undo my changes puts it back, a refusal is said');

console.log(`\n${n} checks passed`);