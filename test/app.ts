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
                  'books']) el(id);

const listeners: Record<string, Function[]> = {};
(globalThis as any).document = {
  // `style.setProperty` because applyLook writes every theme token onto <html> as a custom
  // property now — the nine themes are derived from a table rather than nine blocks of CSS.
  documentElement: { dataset: {}, style: { setProperty() {} } },
  getElementById: (id: string) => nodes.get(id) ?? el(id),
  // Not registered in `nodes`: a created element is not findable by id until something appends it,
  // and nothing here models a tree. It only has to be safe to build, fill and throw away.
  createElement: (tag: string) => ({ ...el('__made__' + Math.random()), tagName: String(tag).toUpperCase() }),
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
    // A PASSAGE IN THE CLOSED CHAPTER, added 2026-09-01. Every passage in this fixture used to sit
    // in `c-2`, the open one — so chapter c-1 was a heading with nothing under it, and issue #37's
    // checks ("reading mode draws every chapter") could not tell a real second chapter from an empty
    // one. Two of those assertions were vacuous against the old fixture and one of them was skipped
    // entirely by its own `if`. Proven by breaking the code three ways and watching only two go red.
    { id: 'p-0', ordinal: 0, body: 'Ashfall took the road in under a day.', author: 'model',
      speaker: null, isBreak: false, chapterId: 'c-1', variantIndex: 1,
      variants: [{ id: 'p-0', selected: true }] },
    // DIRECTED, since 2026-09-01: issue #38 opens the instruction a passage was written from, so
    // the fixture needs a passage that HAS one and others that do not — the press behaves
    // differently for each and a fixture where every passage is the same tests one branch.
    { id: 'p-1', ordinal: 1, body: 'The hall smells of cold iron.', author: 'model', speaker: null,
      directed: true, directive: 'have the envoy arrive early',
      isBreak: false, chapterId: 'c-2', variantIndex: 1, variants: [{ id: 'p-1', selected: true }] },
    { id: 'p-2', ordinal: 2, body: '"You came alone."', author: 'model', speaker: 'Envoy Sereth',
      mode: 'speak',
      isBreak: false, chapterId: 'c-2', variantIndex: 1, variants: [{ id: 'p-2', selected: true }] },
    { id: 'p-3', ordinal: 3, body: '"I came alone because."', author: 'human', speaker: null,
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
              entryType: 'rule', activation: 'always_on', keys: [], lastEditor: 'human', states: [],
              notes: '', addons: [], originId: 'e-origin' }],
  follows: { id: 's-9', title: 'The Ash Cycle' },
  // WHICH THREADS HAVE A PICTURE. `e-1` does and `e-2` does not, so a view that draws one for every
  // card and a view that draws none both fail. `e-shared` has one too: a followed thread's picture
  // lives in the book the thread lives in, and the face here has to show it.
  entryImages: { 'e-1': 1788300000000, 'e-shared': 1788300111000 },
  // A thread taken OUT of this book: a tombstone, listed by name so it can come back.
  dropped: [{ id: 'e-stone', title: 'The Quay Office', originId: 'e-origin-2' }],
  pins: [], arcs: [],
  // What the engine computes in story.ts: the counts the shelf reads, and the stale summaries,
  // which are the part that can be waved away. The panel gates on this being present at all.
  waiting: { proposals: 2, strings: 1, flags: 1,
             stale: [{ id: 'c-1', index: 1, title: 'Ashfall', ref: 'hash-1' }] },
  violations: [{ id: 'v-1', passageId: 'p-2', entryId: 'e-1', quote: 'x', reason: 'gloves', confidence: 0.8 },
               // #9. A NEVER-SENT flag, which is the other fault wearing the same red line: the
               // engine did not give the model this canon, so the fix is a trigger word and not a
               // rewrite. It must not be offered the repair button. Added 2026-09-01 — the fixture
               // had only the ordinary kind, so nothing could tell the two apart on screen.
               { id: 'v-2', passageId: 'p-2', entryId: 'e-2', quote: 'y', reason: 'the stair',
                 confidence: 0.8, reached: false }],
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
// Issue #32. What `POST /api/chapter/end` says about its own four passes, for the one test that
// closes a chapter. Undefined means it says nothing, which is both the all-ran case and the case
// of an older server.
let endPasses: any = undefined;
// bugs.md #9. Which row the stubbed generation says it landed, or undefined for an older server that
// lands nothing and leaves the client to accept.
let stubPassageId: string | undefined = undefined;
(globalThis as any).fetch = async (url: string, init?: any) => {
  if (init?.body) { try { POSTED.push({ url, body: JSON.parse(init.body) }); } catch { /* not JSON */ } }
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
                                    manifest: MANIFEST.manifest })].join('\n') + '\n';
    return { ok: true, status: 200, body: {
      getReader() {
        let sent = false;
        return { read: async () => sent ? { done: true }
          : (sent = true, { done: false, value: new TextEncoder().encode(lines) }) };
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
        // OWED SOMETHING, on purpose. What is waiting is drawn on the band now, which means it is
        // drawn for the hero book and nowhere else — so a hero owed nothing makes the chips
        // untestable, and the assertion would pass against a band that could never draw one.
        proposed: 2, unpaid: 1, flags: 0 },
      // Two of the three are owed something, and between them five separate things — so a shelf that
      // listed items would show five chips where it must show two.
      // #18 §5. One book pinned to a model the router no longer serves — the 2026-08-27 rename is
      // exactly this shape — and one pinned to a model it does, so the mark can be wrong in both
      // directions rather than only missing.
      { id: 's-2', title: 'The Salt Ledger', status: 'in_progress', updatedAt: 2, words: 400, last: 'He paid.',
        proposed: 3, unpaid: 1, flags: 0, model: 'write-nt-qwen36-h' },
      { id: 's-3', title: 'Sutera', status: 'draft', updatedAt: 1, words: 0, last: null,
        // unpaid: 2 since 2026-08-31. This book used to be owed ONLY its two flags, and flags
        // stopped counting toward the strip that day — so without a kind that still counts, the
        // second book falls off and this stops testing grouping at all. It has to WIN a kind, not
        // merely have one: `waiting()` returns one row per kind naming the book with the most of
        // it, so a tie with The Salt Ledger's 1 would still name that book and draw one chip. The
        // flags stay, so the fixture still proves they contribute nothing.
        proposed: 0, unpaid: 2, flags: 2, model: 'Qwen3.6-WNTH-35B-A3B-NN' },
      // A FOURTH, PUT AWAY. Added 2026-08-31 with the archived section: the shelf splits live
      // books from archived ones under their own header, and with no archived book in the
      // fixture that split renders identically either way and the assertion below cannot fail.
      { id: 's-4', title: 'The Drowned Almanac', status: 'archived', updatedAt: 0, words: 60,
        last: 'It ended.', proposed: 0, unpaid: 0, flags: 0 },
      // A WORLD BOOK ON THE SHELF FIXTURE, added 2026-08-31 after one crashed the Threads page
      // in Seth's hands. storyCard assigned to a `const tags` for world books and threw, which
      // killed drawPage inside loadLedger and left the page reading "Reading the threads…" for
      // ever. Nothing in the suite had ever rendered a world-book card, so nothing could see it.
      { id: 's-5', title: 'The Tessellate', status: 'in_progress', updatedAt: 5, words: 0,
        last: null, proposed: 0, unpaid: 0, flags: 0, is_world: 1, genre: 'fantasy' }], model: 'write-nt-qwen36-h', slot: SLOT, gen: STORY.gen,
      // The writer's default look rides the library call, which is the first thing asked for.
      look: { theme: 'parchment', font: 'garamond', size: 'l', scale: '110' } })
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
        { id: 'e-2', story: 's-2', storyTitle: 'The Salt Ledger', title: 'the Ambersand',
          body: 'A house that lends at ruin.', entryType: 'lore',
          activation: 'triggered', keys: ['Ambersand'], addons: [], outfits: [] },
        // A card in the WORLD BOOK, so it has a group on the Threads page at all — the list is
        // grouped by book and built from entries, so a world book with no cards is not on it.
        { id: 'e-3', story: 's-5', storyTitle: 'The Tessellate', title: 'Ring Law',
          body: 'Nobody descends without a writ.', entryType: 'rule',
          activation: 'always_on', keys: [], addons: [], outfits: [] }] }
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
    // #18 §3. The library rides beside the modes rather than inside them, which is the shape the
    // route returns: a saved voice is not a sixth mode and must never be drawn as one.
    : url.startsWith('/api/prompts') ? { defaults: { continue: 'Carry on.', speak: 'Say it.',
        act: 'Do it.', direct: 'Make it happen.', narrate: 'Write it.' },
        yours: {}, voice: { shipped: 'The shipped voice.', mine: null, inUse: 'The shipped voice.' },
        library: { voice: [{ name: 'Noir', text: 'Wet streets. Nobody explains themselves.' }],
                   style: [] } }
    : url.startsWith('/api/spark') ? { story: { title: 'The Winter Signature', genre: 'political fantasy',
        premise: 'Six houses have one winter to sign a peace none of them wants.',
        setting: 'Ashfall Hall', pov: 'third limited, past tense', spice: 2,
        writingStyle: 'Cold, spare.', persona: 'Ilva Marren' },
        entries: [{ title: 'Ilva Marren', entryType: 'character', body: 'A envoy with nothing to trade.' }] }
    // Issue #32. What the chapter close reports about its own four passes. `undefined` is the
    // normal answer — every pass ran — and a route that predates the field returns nothing at all,
    // which has to read the same way.
    : url.startsWith('/api/chapter/end') ? { ...STORY, passes: endPasses }
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
  // THE BAND, NOT A HERO CARD. The newest book used to be a full-width `.storycard.hero` at 3/4 —
  // about a thousand pixels of cover on a laptop, with every other book under the fold and the one
  // thing you came back for, where you stopped, not on the screen at all. It is now a band that
  // carries the sentence you stopped on and one gold action.
  assert.ok(shelf.indexOf('class="resumeband"') >= 0, 'the newest book gets the resume band');
  assert.doesNotMatch(shelf, /storycard hero/,
    'and no hero card survives beside it — two answers to "which book" is one too many');
  // The band's job is the sentence. A band that renders with the chrome and no prose in it is the
  // old shelf wearing a new shape, and it would pass every structural check above.
  assert.match(shelf, /data-carryon="/, 'the band carries the one gold action');
  assert.match(shelf, /Where you left off/, 'and says what it is showing you');
  assert.doesNotMatch(shelf, /data-open="new"/,
    'the shelf itself offers no New story button — the rail is the one door');
  assert.match(html('bar'), /<button class="pill" data-open="new"/,
    'and the bar pill is not deskonly, or a phone has no door at all');
}
ok('one New story button, on the bar, and the shelf does not repeat it');

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
  target: { closest: () => ({ dataset, querySelector: () => null, disabled: false, textContent: '' }) },
}));
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
// THE CLASS TOKEN, not the whole attribute. This read `class="block speak"` exactly, so it went red
// the moment that passage also carried a mode accent — a true statement about the markup breaking on
// an unrelated addition. `\b` on both sides, or `speak` would also match `m-speak`.
assert.match(html('col'), /class="[^"]*\bspeak\b[^"]*"/, 'quoted prose is a speech block');
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
  const chips = [...col.matchAll(/<div class="from"><i><\/i>([^<]*)</g)].map((m) => m[1].trim());
  assert.strictEqual(chips.length, (col.match(/class="block/g) ?? []).length,
    'every passage says where it came from, not just the ones with a mode');
  // AT THE TOP OF ITS BLOCK, which is what was asked for — before the prose, not under it.
  const one = col.slice(col.indexOf('class="block'));
  assert.ok(one.indexOf('class="from"') < one.indexOf('data-edit='),
    'the chip comes before the words it is about');
  // A MODE IS NAMED BY ITS PRESS. p-4 is a human narration and p-5 is spoken as someone else, so a
  // chip that just said "You" for every human row would fail here.
  // CONTINUE IS ONE OF THEM. It is a press beside the four modes rather than one of them, so it fell
  // through both the accent class and the chip's label and read as a passage from nowhere.
  assert.ok(col.includes('class="block you m-continue"') || /m-continue/.test(col),
    'a passage Continue wrote carries the accent class, like every other press');
  assert.ok(chips.includes('Continue'), `and its chip names it — got ${JSON.stringify(chips)}`);
  assert.ok(chips.some((c) => /Speak|Act|Direct|Narrate/.test(c)),
    `at least one chip names the press that made it — got ${JSON.stringify(chips)}`);
  // AND A SPOKEN LINE CARRIES WHO SAID IT, which is the one thing the colour cannot say.
  assert.match(col, /<div class="from"><i><\/i>[^<]*&middot; Envoy Sereth</,
    'a line spoken as someone else names them on the chip');
}
ok('every passage carries a chip saying where it came from, above the prose');
assert.match(html('col'), /Contradiction · Envoy Sereth/, 'a violation must surface on its passage');
// ISSUE #9 · THE REPAIR IS A PRESS, AND ONLY ON THE FAULT A REWRITE CAN FIX.
//
// Two different faults wear the same red line, and the flag row already says which is which. A
// CONTRADICTION is canon the model was shown and broke — a rewrite is the answer. A NEVER-SENT flag
// is canon the engine did not give it, and asking the model to correct prose against something it
// was never told is asking it to guess; the fix there is a trigger word or always-on.
//
// The fixture carries one of each, and the two are separated by `reached`. The button must follow
// that field and not the presence of a flag — offering it on a never-sent flag would spend a model
// call to produce prose the checker will flag again for the same reason.
{
  const col = html('col');
  assert.match(col, /Never sent · The stair/, 'the fixture really carries a never-sent flag too');
  const acts = [...col.matchAll(/<div class="flagacts">[\s\S]*?<\/div>/g)].map((m) => m[0]);
  assert.strictEqual(acts.length, 2, `two flags, two action rows, and there are ${acts.length}`);
  const withRepair = acts.filter((a) => /data-repair=/.test(a));
  assert.strictEqual(withRepair.length, 1,
    'exactly one of the two flags may offer the repair — the contradiction, not the never-sent one');
  assert.match(withRepair[0], /data-repair="p-2"/, 'and it names the passage it would correct');
  // The other way round, asserted rather than assumed: whichever row has no repair must be the
  // never-sent one, or the gate is inverted and reads as working.
  const without = acts.find((a) => !/data-repair=/.test(a))!;
  assert.match(without, /data-mute="e-2"/,
    'the row with no repair is the never-sent flag, whose fix is a trigger word');
  // Both faults keep the presses that DO apply to them.
  for (const a of acts) assert.match(a, /data-dropflag=/, 'either kind can be dismissed');
}
ok('a contradiction can be corrected in place; a never-sent flag is not offered a rewrite (#9)');
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

// The four modes are options on one dial since 2026-09-02, and two of them are worded as the
// phrase the name beside them completes. The dial block further down asserts all four by value;
// this pair is the two whose LABEL is the thing that changed.
for (const label of ['Speaking As', 'Acting As', 'Direct', 'Narrate']) {
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
// The hint names the thing you type and puts the persona in it — Seth, 2026-09-02: "the help hints
// in the input box should be rewritten so they make sense". It read "Say it as Ilva Marren", which
// is what the dial says now, and Act's read "What Ilva Marren do".
assert.match(html('dockCol'), /The words Ilva Marren says/,
  'the placeholder follows the mode and the persona, and is grammatical with a name in it');
// ONE DIAL, NOT FOUR BUTTONS, since 2026-09-02 — Seth: "make speak, act, direct and narrate into
// a drop down. the selection should look like a button." Asserted as one select carrying all four
// AND as the absence of the buttons: putting the dial in without taking the rail out is the shape
// that ships both, and only the pair can catch it.
const dial = () => html('dockCol').match(/<select class="dial" data-modesel[\s\S]*?<\/select>/)?.[0] ?? '';
assert.ok(dial(), 'the rail must carry the mode dial');
for (const k of ['speak', 'act', 'direct', 'narrate'])
  assert.match(dial(), new RegExp(`value="${k}"`), `${k} must be an option on the dial`);
assert.doesNotMatch(html('dockCol'), /data-mode="/,
  'and the four mode buttons are gone — one control, not five');
assert.match(dial(), /value="speak"[^>]*selected/, 'the mode being drawn is the one selected');
// SPEAKING AS, ACTING AS. Seth, same message: the two modes that take a name say so, because the
// name sits directly beside the dial and the two read as one phrase.
assert.match(dial(), /Speaking As/, 'Speak reads "Speaking As" on the dial');
assert.match(dial(), /Acting As/, 'and Act reads "Acting As"');
// TITLE CASE ON EVERY LABEL, all four and both doors — Seth, 2026-09-02: "all the labels should be
// Camel Cased for uniformity." A lower-case option beside three capitalised ones is the state this
// catches, and it is the state the dial shipped in for an hour.
for (const l of ['Speaking As', 'Acting As', 'Direct', 'Narrate', 'Threads', 'View Threads', 'Add Threads'])
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
// The two thread doors are ONE dial too — Seth, 2026-09-02: "threads and +threads should be its own
// drop down that will mimic the style of this as well ... to view threads and add threads."
// THE OPTIONS CARRY THE SAME `data-` THE BUTTONS DID, which is the whole reason the two doors still
// work: the delegated listener matches the attribute wherever it is. Asserted on the attributes and
// not on the words, because the words are what changed and the attributes are what must not.
const modeRow = html('dockCol').match(/<div id="modes">[\s\S]*?<\/div>/)?.[0] ?? '';
assert.ok(modeRow, 'the mode row must exist');
const threads = modeRow.match(/<select class="dial" data-threadsel[\s\S]*?<\/select>/)?.[0] ?? '';
assert.ok(threads, 'the rail must carry the threads dial');
// THE LABEL IS HIDDEN FROM THE MENU AND STILL THE BUTTON'S TEXT — Seth, 2026-09-02: "in the drop
// down threads can be removed sinve it goes nowhere." Both halves asserted: it must not appear as a
// row you can pick, and it must still be there to fall back to, or the closed control ends up
// reading "Add Threads" as though that were a state.
assert.match(threads, /<option value="" selected disabled hidden>Threads</,
  'whose closed label is Threads, hidden from the open menu because picking it does nothing');
assert.match(threads, /data-goblock="threads:"/, 'View Threads opens this book\'s list');
assert.match(threads, /data-newlore="1"/, 'and Add Threads opens the write-it-down tray');
assert.ok(modeRow.indexOf('data-modesel') < modeRow.indexOf('data-threadsel'),
  'the mode dial comes before the thread doors');
assert.match(threads, /margin-left:auto/,
  'and the gap that separates them is on the threads dial, or they are not right-aligned');
// (The two assertions that used to follow — "Anansi is last" — were measuring the sentence
//  `data-panel="anansi" still opens it` inside a comment in this row, not any markup. Anansi came
//  off the row on 2026-08-28 and they could not have failed since.)
ok('the composer offers one mode dial, one threads dial, and the name beside the dial');

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
  // THE BAR COUNTS CHAPTERS, NOT CONTEXT, since 2026-09-02. One segment per chapter, the one you
  // are in lit. Asserted as a COUNT against the fixture's own chapters and as the position of the
  // lit one — a bar that drew a fixed number of segments, or lit the first one always, is the shape
  // that says "chapter 1 of 4" for the whole book.
  const segs = [...html('ctxbar').matchAll(/<i class="([^"]*)"><\/i>/g)].map((m) => m[1]);
  assert.strictEqual(segs.length, STORY.chapters.length,
    `the bar must have one segment per chapter, not ${segs.length} for ${STORY.chapters.length}`);
  assert.strictEqual(segs.filter((c) => c.includes('at')).length, 1,
    'and exactly one of them is the chapter you are in');
  assert.strictEqual(segs.findIndex((c) => c.includes('at')),
    STORY.chapters.findIndex((c: any) => c.id === STORY.currentChapter.id),
    'and it is the one the view says you are in');
  // AND THE PERCENTAGE IS NOT IN IT. The bar was a single `<i>` filled to the context percentage,
  // and this is what goes red if that comes back — the number belongs in the reading, in words.
  assert.ok(!/width:/.test(html('ctxbar')),
    'the bar no longer fills to a percentage; the context number lives in the reading');
  assert.ok(!nodes.get('ctxbar').hidden, 'and it is shown while a story is open');
  assert.ok(!/\d+ words|context \d+%/.test(html('bar')),
    'and the header carries neither the word count nor the percentage any more');

  // ALWAYS OPEN, with no press at all — Seth, 2026-09-02: "have this always visible." It used to be
  // shut until the bar was pressed, and the bar has no press any more, so a reading that still
  // waited for one could not be opened by anybody.
  const read = html('ctxread');
  assert.ok(!nodes.get('ctxread').hidden, 'the reading is open with nothing pressed');
  assert.match(read, /chapter 2 of 2/, 'which says which chapter you are on');
  assert.match(read, /words/, 'and how many words are in it');
  assert.match(read, new RegExp(`context ${pct}%`), 'and what the context costs');
  assert.match(read, /data-panel="context"/, 'with the way through to the blocks behind it');

  // NO ROOM IS NOT NO BAR. A budget of zero — llama-server unreachable so the slot is unknown, or
  // a prompt that will not fit — makes the percentage null, and the first version hid the meter
  // for it. That took the bar away at the moment it says the most, and it hid it through a whole
  // browser scenario because the test server has no model to size a slot with.
  const realBudget = MANIFEST.manifest.totals.budget;
  MANIFEST.manifest.totals.budget = 0;
  click({ open: 's-1' });
  await new Promise((r) => setTimeout(r, 40));
  assert.ok(!nodes.get('ctxbar').hidden, 'the bar stays when there is no room — that is when it matters');
  assert.match(html('ctxread'), /no room/, 'and the reading says so in words, with nothing pressed');
  MANIFEST.manifest.totals.budget = realBudget;
  click({ open: 's-1' });
  await new Promise((r) => setTimeout(r, 40));
}
ok('the bar counts chapters, and the reading is always open');

// ---- THE STORY PANEL IS FOUR GROUPS BEHIND FOUR CHIPS (2026-09-02).
// Seth: "this is so much information that its overwhelming. give it filter buttons to reach the
// information." Eleven fields, a cover, a world link, three exports, an archive and a delete were
// one scroll.
{
  click({ panel: 'story' });
  await new Promise((r) => setTimeout(r, 40));
  const panel = html('sideBody');
  for (const g of ['voice', 'book', 'world', 'keep'])
    assert.match(panel, new RegExp(`data-group="${g}"`), `the panel must draw the ${g} group`);
  // ALL FOUR ARE DRAWN AND ONE IS SHOWN. The container says which, and the stylesheet does the
  // hiding — asserted here as the attribute, because that is the contract the CSS reads.
  assert.match(panel, /data-tab="voice"/, 'and it opens on the voice, which is the group he named first');
  assert.match(panel, /data-storytab="book"/, 'with a chip for each of them');
  // HIS TWO GROUPS, in his order: the voice first, title/genre/premise second.
  const voice = panel.match(/data-group="voice"[\s\S]*?data-group="book"/)?.[0] ?? '';
  assert.match(voice, /f-story-writingStyle/, 'the voice group holds the voice of the weave');
  assert.match(voice, /f-story-styleNote/, 'and how this book is written');
  assert.ok(!/f-story-title/.test(voice), 'and not the title, which is the second group');
  const book = panel.match(/data-group="book"[\s\S]*?data-group="world"/)?.[0] ?? '';
  for (const k of ['title', 'genre', 'premise'])
    assert.match(book, new RegExp(`f-story-${k}`), `the book group holds the ${k}`);
  // SAVE IS OUTSIDE THE GROUPS. Issue #33 pinned it to the top of this panel; a Save that only
  // exists on one of four tabs is worse than one you have to scroll to.
  assert.ok(panel.indexOf('savebar') < panel.indexOf('data-group='),
    'Save stays above the chips, on every group');
  // AND PRESSING A CHIP DOES NOT REDRAW, which is asserted ON THE SOURCE rather than through this
  // harness. Every box in the panel is free text waiting on Save, so a repaint on a tab press
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
  await new Promise((r) => setTimeout(r, 40));
}
ok('the story panel is four groups behind four chips, and switching cannot lose what you typed');

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
  for (const room of ['facts', 'role', 'interiority', 'voice', 'history'])
    assert.match(onlyChanged, new RegExp(`<option value="${room}"`), `no way to send it to ${room}`);
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
  await new Promise((r) => setTimeout(r, 30));
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
  await new Promise((r) => setTimeout(r, 30));
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
  await new Promise((r) => setTimeout(r, 30));
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
      await new Promise((r) => setTimeout(r, 60));
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
      await new Promise((r) => setTimeout(r, 60));
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
      await new Promise((r) => setTimeout(r, 60));
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
    ['5 threads proposed', '2 promises unpaid'],
    'it counts across books, and says one thread rather than one threads');

  // AND FLAGS ARE NOT IN IT, on purpose, since 2026-08-31. The contradiction check moved off the
  // generation path and files a flag detached; Seth's rule for that flag is that it "can be
  // silently ignored ... if the writer keeps writing". A count on the strip is the opposite of
  // that. `s-2` carries a flag in the fixture above and must contribute nothing here.
  assert.ok(!w.some((x: any) => x.key === 'flags'),
    'a flag never joins the waiting strip — it is found when you go looking, not on the way past');
  assert.deepStrictEqual(
    waiting([{ id: 's', title: 'x', proposed: 0, unpaid: 0, flags: 7 }] as any), [],
    'and a book whose only outstanding thing is flags shows no strip at all');

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

// ---- ARCHIVED BOOKS GET THEIR OWN END OF THE SHELF (2026-08-31). Seth: "archived stories should be
// visually different and set under a different header calling it out as archived." They were already
// sorted last and already drawn dimmed; what was missing is that a dimmed card at the end of one
// grid still reads as part of the shelf.
{
  click({ leave: '1' });
  await new Promise((r) => setTimeout(r, 40));
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
    { id: 's-real', title: 'A Real Book', status: 'in_progress', proposed: 1, unpaid: 1, flags: 0 },
    { id: 's-w', title: 'The Tessellate', status: 'in_progress', proposed: 9, unpaid: 9, flags: 0,
      is_world: 1 },
  ];
  const out = w(rows);
  assert.ok(!out.some((x: any) => x.storyId === 's-w'),
    'the waiting strip never points at a world book, even when it carries the higher count');
  assert.deepStrictEqual(out.map((x: any) => x.total), [1, 1],
    "and the world book's nine of each are not added in");
  ok('a world book is not counted as a book with work waiting in it');
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
  const open = async () => { click({ open: 's-1' }); await new Promise((r) => setTimeout(r, 40)); };
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
  await new Promise((r) => setTimeout(r, 40));
  click({ nav: 'create' });
  await new Promise((r) => setTimeout(r, 40));
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

// WHAT IS OWED SITS ON THE BAND, BESIDE THE BOOK IT IS ABOUT. It used to be a strip across the top
// of the page listing a book title and a number. That number was a count of KINDS and never of
// items — it counted the rows `waiting()` returns, and `waiting()` returns at most one per kind —
// so a book with nine proposals said "· 1". On the band there is one book to speak for, so the
// chips can say the kind and the real count.
{
  click({ leave: '1' });
  await new Promise((r) => setTimeout(r, 40));
  const page = html('page');
  // The KIND, with its own number, which is the whole reason this moved. A digit alone was the
  // old strip's failure and an assertion that only counted chips could not see it.
  assert.match(page, /2 threads proposed/, 'the chip says what is waiting, not how many kinds');
  assert.match(page, /1 promise unpaid/, 'and singular reads as singular');
  // Each kind opens the panel that DECIDES it. The old strip sent every chip to 'waiting'
  // regardless, because it had thrown the kind away before it drew anything.
  assert.match(page, /data-owed="s-1" data-owedpanel="chapter"/, 'proposals open the chapter panel');
  assert.match(page, /data-owed="s-1" data-owedpanel="strings"/, 'promises open Strings');
  // THE COST, WRITTEN DOWN. The Salt Ledger is owed three proposals and a promise and is not the
  // hero, so the shelf now says nothing about it — an owed thing reads as information beside its
  // book and as a notification at the top of a page, and this is the price of choosing the first.
  // If a later change puts a cross-book indicator back, this is the assertion that should fail.
  assert.ok(!/data-owed="s-2"/.test(page),
    'a book that is not the hero shows nothing owed on the shelf — deliberate, and the trade');
}
ok('what is owed is drawn on the band, by kind, and opens the panel that decides it');
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
  // THREE since 2026-08-31, when a world book joined the ledger fixture so the hero-banner
  // assertions at the foot of this file have a world book to open. The number is the count of
  // books with cards in them, so adding one to the fixture is meant to change it.
  assert.match(page, /All 3 books/, 'and the press says how many books that is');

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
  await new Promise((r) => setTimeout(r, 40));

  // THE RAIL: exactly one row is the one you are on. `aria-current`, not `aria-pressed` — these
  // are places you go, one of which you are at, rather than switches.
  const rail = html('rail');
  const current = [...rail.matchAll(/data-nav="([a-z]+)"([^>]*)/g)]
    .filter((m) => /aria-current="page"/.test(m[2])).map((m) => m[1]);
  assert.strictEqual(current.length, 1,
    `exactly one rail row is current and ${current.length} claim to be`);
  // AND IT IS THE LIT ONE. This is the pairing: the gold background and the aria have to name the
  // same row, or the attribute is decoration that happens to be present.
  const lit = [...rail.matchAll(/data-nav="([a-z]+)"([^>]*?)>/g)]
    .filter((m) => /rgba\(217,178,106,\.08\)/.test(m[2])).map((m) => m[1]);
  assert.deepStrictEqual(current, lit, 'the row that reads as current must be the row that is lit');

  // THE CHAPTER LIST: same rule, and the fixture has more than one chapter so it can fail.
  click({ railview: 'story' });
  await new Promise((r) => setTimeout(r, 30));
  const chapters = [...html('rail').matchAll(/data-chapter="([^"]+)"([^>]*?)>/g)];
  if (chapters.length > 1) {
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
  await new Promise((r) => setTimeout(r, 30));
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
  await new Promise((r) => setTimeout(r, 30));
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
  await new Promise((r) => setTimeout(r, 40));
  click({ panel: 'threads' });

  // ---- READ THROUGH from the book this one follows. One card, not two copies kept in step.
  click({ entry: 'e-shared' });
  await new Promise((r) => setTimeout(r, 30));
  const shared = html('sideBody');
  assert.match(shared, /This thread lives in The Ash Cycle/, 'the face says where it lives');
  // THE BODY IS EDITABLE AND SAVES TO THE OTHER BOOK. It could not before: `upsertEntry` is scoped
  // by story, so a save from here did not resolve the id and MINTED A DUPLICATE — two cards with
  // one name, drifting, and the writer believing they had edited the shared one. That is why this
  // face was read-only, and `db.upsertEntry`'s redirect is what makes the box safe.
  assert.match(shared, /data-followedbody="e-shared"/, 'its description can be edited here');
  assert.match(shared, /data-savefollowed="e-shared"/, 'and saved');
  assert.match(shared, /Save to The Ash Cycle/, 'saying which book the save lands in');
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
  await new Promise((r) => setTimeout(r, 30));
  const took = html('sideBody');
  assert.match(took, /This book's own copy, taken from The Ash Cycle/,
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
  await new Promise((r) => setTimeout(r, 30));
  const story = html('sideBody');
  assert.match(story, /Taken out of this book/, 'what this book has removed is named');
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
  await new Promise((r) => setTimeout(r, 40));
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
    // A REPAINT THAT CHANGED NOTHING MUST NOT MOVE THE PAGE — an edit, a panel, a toast. It goes to
    // the bottom because that is what being at the tip has always meant, and never to the seam.
    atTip();
    redraw();
    assert.strictEqual(read.scrollTop, 9000,
      'a repaint with the same newest passage keeps the old behaviour and does not pin');

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
    assert.strictEqual(read.scrollTop, 9000, 'the next repaint is an ordinary one again');

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
  await new Promise((r) => setTimeout(r, 40));
  click({ readmode: '1' });
  await new Promise((r) => setTimeout(r, 40));
  const doc = html('col');
  const chapters = [...doc.matchAll(/<section class="chap" id="ch-(\d+)"/g)].map((m) => m[1]);
  assert.ok(chapters.length > 1, `reading mode draws every chapter and drew ${chapters.length}`);
  // AN ANCHOR PER CHAPTER, which is the thing he offered as an acceptable minimum.
  assert.deepStrictEqual(chapters, [...new Set(chapters)], 'each anchor is its own chapter');
  // ONE BREAK FEWER THAN THERE ARE CHAPTERS: between them, never above the first, where it would be
  // a rule under the header with nothing above it to separate from.
  const breaks = (doc.match(/class="chapbreak"/g) ?? []).length;
  assert.strictEqual(breaks, chapters.length - 1,
    `${chapters.length} chapters want ${chapters.length - 1} breaks and got ${breaks}`);
  assert.ok(doc.indexOf('class="chapbreak"') > doc.indexOf('id="ch-1"'),
    'and the first break comes after the first chapter has started, not before it');
  click({ readmode: '0' });
  await new Promise((r) => setTimeout(r, 30));
  // WRITING STILL DRAWS ONE, which is the trade #37 deliberately kept — so no break at all.
  assert.strictEqual((html('col').match(/class="chapbreak"/g) ?? []).length, 0,
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
  const src = (html, id) => new RegExp(`<img src="[^"]*entry=${id}[^"]*"`).test(html);
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
  await new Promise((r) => setTimeout(r, 40));
  click({ backentry: '1' });
  click({ panel: 'threads' });
  await new Promise((r) => setTimeout(r, 30));
  // AND SHUT THE WRITE-IT-DOWN TRAY IF IT IS OPEN, which an earlier block leaves it. The panel draws
  // the tray INSTEAD of the list, so this is about reaching the list at all.
  //
  // KEYED ON THE LIST BEING ABSENT, not on a marker in the markup. `newlore` TOGGLES, and the closed
  // panel carries a `data-newlore` button of its own — so a guard that looked for that marker opened
  // the tray it was trying to close, and every assertion below then failed for the wrong reason.
  if (!/data-entry=/.test(html('sideBody'))) {
    click({ newlore: '1' });
    await new Promise((r) => setTimeout(r, 30));
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
  await new Promise((r) => setTimeout(r, 30));
  const face = html('sideBody');
  assert.ok(src(face, 'e-1'), 'the read face shows it');
  assert.ok(before(face, 'entry=e-1', 'Envoy Sereth'), 'above the name');

  // 3 · THE FORM. It is the one view that could already show a picture, and the point here is that
  // it now comes BEFORE the fields rather than after the facts room.
  click({ cardview: 'form' });
  await new Promise((r) => setTimeout(r, 30));
  const form = html('sideBody');
  assert.ok(src(form, 'e-1'), 'the form shows it');
  assert.ok(before(form, 'entry=e-1', 'f-card-body'),
    'and the picture row is above Info now, not under the facts room');
  click({ cardview: null });
  click({ backentry: '1' });

  // 4 · A FOLLOWED THREAD'S FACE. Its picture lives in the book the thread lives in, and this face
  // is read-only about everything else — the picture is the one thing it can still show.
  click({ panel: 'threads' });
  await new Promise((r) => setTimeout(r, 30));
  click({ entry: 'e-shared' });
  await new Promise((r) => setTimeout(r, 30));
  const shared = html('sideBody');
  assert.ok(src(shared, 'e-shared'), 'a followed thread shows its picture too');
  assert.ok(before(shared, 'entry=e-shared', 'The Ambersand'), 'above its name');
  click({ backentry: '1' });
  ok('a thread with a picture shows it at the top of the list, both faces and the form');
}

// ---- AND ON THE PAGE THAT SPANS THE SHELF, from that page's own data.
//
// The cross-story Threads page is one book's `V` away from the truth: it lists every book, so the
// stamp cannot come from `V.entryImages`. `GET /api/ledger` carries `imageAt` per row, keyed by BOTH
// ids — a followed thread has a picture in the book it lives in and not in the book following it.
{
  click({ leave: '1' });
  await new Promise((r) => setTimeout(r, 40));
  // `canon` is the KEY; `threads` is only the glyph beside it in WNAV. And `loadLedger` is async and
  // paints when it lands, so the first read says "Reading the threads…" — waited for rather than
  // slept past, or this asserts a loading line.
  click({ nav: 'canon' });
  for (let i = 0; i < 40 && !/data-entry=/.test(html('page')); i++)
    await new Promise((r) => setTimeout(r, 25));
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

// #18 §3 · THE STYLE LIBRARY, and the writer's default voice getting a surface at last.
//
// checks.md: "a new collection of voices or narraration styles that can be pulled from… so i dont
// have to copy and paste from somewhere else".
{
  const doc = (globalThis as any).document;
  click({ open: 's-1' });
  await new Promise((r) => setTimeout(r, 40));
  click({ panel: 'teller' });
  for (let i = 0; i < 40 && !/data-mydefaultvoice/.test(html('sideBody')); i++) {
    await new Promise((r) => setTimeout(r, 25));
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

  click({ panel: 'story' });
  await new Promise((r) => setTimeout(r, 30));
  const story = html('sideBody');
  assert.match(story, /data-applylib="voice:Noir"/, 'the saved voice is on the shelf beside the field');
  assert.match(story, /data-dellib="voice:Noir"/, 'with a way to forget it');
  assert.match(story, /data-savelib="voice"/, 'and a way to save what is in the box');
  assert.match(story, /data-savelib="style"/, 'the style field has its own shelf');
  assert.doesNotMatch(story, /data-applylib="style:/, 'which is empty, and separate from the voice one');

  // APPLYING COPIES INTO THE BOX AND STOPS. A library that saved on apply would overwrite a page of
  // hand-written voice with one press and no undo.
  const box: any = { value: 'typed by hand' };
  const wasQS = doc.querySelector;
  doc.querySelector = (sel: string) => (sel === '[data-story="writingStyle"]' ? box : null);
  try {
    POSTED.length = 0;
    click({ applylib: 'voice:Noir' });
    await new Promise((r) => setTimeout(r, 30));
    assert.strictEqual(box.value, 'Wet streets. Nobody explains themselves.', 'it copies in');
    assert.deepStrictEqual(POSTED.map((x) => String(x.url)), [],
      'and writes nothing anywhere — Save is still the press that keeps it');
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
    await new Promise((r) => setTimeout(r, 40));
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
    await new Promise((r) => setTimeout(r, 60));
    const cold = html('page');
    assert.match(cold, /Nothing on the shelf yet/, 'an empty shelf is the idea box, not a heading');
    assert.match(cold, /id="idea"/, 'and the box is on it, rather than a button that goes to find one');
    // The same id and the same action the create page uses, so there is one spark path and not two.
    assert.match(cold, /data-spark="1"/, 'the gold press sparks from here directly');
    assert.doesNotMatch(cold, /class="grid"|class="shelfgrid"|dashed/,
      'no empty grid and no dashed cells — there is nothing to put in them');
    assert.match(cold, /The model is asleep/, 'a sleeping router is said out loud before the first press');
    assert.match(cold, /Wake the model first/, 'with somewhere to go about it');

    // The same screen with the model up. THIS is the half that fails silently: a line printed
    // unconditionally passes every assertion above and lies to everyone whose model is running.
    shelf({ stories: [], model: 'Qwen3.6-WNTH-35B-A3B-NN', slot: SLOT, gen: STORY.gen, look: null });
    click({ home: '1' });
    await new Promise((r) => setTimeout(r, 60));
    const warm = html('page');
    assert.match(warm, /Nothing on the shelf yet/, 'still the idea box');
    assert.doesNotMatch(warm, /The model is asleep/,
      'and it does not claim a loaded model is asleep');
    assert.doesNotMatch(warm, /Wake the model first/,
      'nor offer to wake something already awake');
    assert.match(warm, /Nothing here leaves the machine/, 'the local promise is made either way');
  } finally {
    shelfOverride = null;
    click({ home: '1' });
    await new Promise((r) => setTimeout(r, 60));
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
  await new Promise((r) => setTimeout(r, 40));
  click({ nav: 'canon' });
  await new Promise((r) => setTimeout(r, 60));
  // THE PAGE OPENS ON ONE BOOK — the one you were last writing in — so every other book has no
  // group at all until this. The first version of this test pressed a group that was not on the
  // page and read the word "World book" off the New-world-book row instead, which passed.
  click({ lookall: '1' });
  await new Promise((r) => setTimeout(r, 40));
  const page = html('page');
  assert.doesNotMatch(page, /Reading the threads/,
    'the Threads page finishes loading — it hung here for ever when a world book threw');

  // The first group is open by default, and every other is a heading you press. The banner belongs
  // to the OPEN one, so a banner per book would be the failure this counts.
  const banners = page.match(/class="lbanner"/g) ?? [];
  assert.strictEqual(banners.length, 1,
    `one banner, on the book that is open — drew ${banners.length}`);

  // Open the world book's group and it wears its own tag rather than a writing status.
  click({ lbook: 's-5' });
  await new Promise((r) => setTimeout(r, 40));
  // #books, not #page: opening a group repaints only that element.
  const opened = html('books');
  assert.match(opened, /class="lbanner"/, 'the world book gets a banner too');
  assert.match(opened, /World book/, 'tagged as what it is, not as Writing');
  assert.match(opened, /Lore only/, 'and it says there is nothing written in it');
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
  await new Promise((r) => setTimeout(r, 40));
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
    await new Promise((r) => setTimeout(r, 30));
    const gen = POSTED.find((p: any) => String(p.url) === '/api/settings');
    assert.ok(gen, 'letting go of a sampler slider saves it with no Save pressed');
    // ALL THREE, because that is what the Save button always sent and what the route merges.
    assert.strictEqual(gen.body.temperature, 1.1, 'and it carries the slider that moved');
    assert.strictEqual(gen.body.target_words, 600, 'and the rest of the panel with it');
    // Numbers, not strings: `Number(el.value)` is the whole reason this is not a spread.
    assert.strictEqual(typeof gen.body.top_p, 'number', 'as numbers, not the strings a range gives');

    POSTED.length = 0;
    changeIn({ dataset: { story: 'coverOpacity' }, type: 'range', value: '55' });
    await new Promise((r) => setTimeout(r, 30));
    const cov = POSTED.find((p: any) => String(p.url) === '/api/story');
    assert.ok(cov, 'and so does the cover slider on the story panel');
    assert.strictEqual(cov.body.story.coverOpacity, 55, 'as a number the column can clamp');

    // The two that already worked, asserted here so a future guard cannot drop them quietly.
    POSTED.length = 0;
    changeIn({ dataset: { story: 'lockoutOn' }, type: 'checkbox', checked: false });
    await new Promise((r) => setTimeout(r, 30));
    const box = POSTED.find((p: any) => String(p.url) === '/api/story');
    assert.ok(box, 'a checkbox still saves itself');
    assert.strictEqual(box.body.story.lockoutOn, false,
      'and reads `checked`, not `value` — an unchecked box\'s value is the string "on"');

    POSTED.length = 0;
    changeIn({ dataset: { story: 'pov' }, tagName: 'SELECT', type: 'select-one', value: 'first' });
    await new Promise((r) => setTimeout(r, 30));
    assert.ok(POSTED.find((p: any) => String(p.url) === '/api/story'), 'a picker still saves itself');

    // AND THE ABSENCE, which is the half that passes for the wrong reason. Text must still wait:
    // a box that saved itself mid-sentence would fight the writer.
    POSTED.length = 0;
    changeIn({ dataset: { story: 'premise' }, type: 'text', value: 'half a th' });
    changeIn({ dataset: { story: 'title' }, tagName: 'TEXTAREA', type: 'textarea', value: 'half a ti' });
    await new Promise((r) => setTimeout(r, 30));
    assert.strictEqual(POSTED.filter((p: any) => String(p.url) === '/api/story').length, 0,
      'and typing into free text still commits nothing until Save');
  } finally { doc.querySelectorAll = wasQSA; }
  ok('sliders save themselves — the sampler and the cover — and free text still waits for Save');
}

// ---- WHEN A CHAPTER CLOSE'S PASSES DO NOT RUN, THE SCREEN SAYS SO (issue #32). Seth: "Facts are
// not being written based on the last chapter anymore."
//
// Four model passes run on close — summary, character memory, facts, finished threads — and each is
// wrapped server-side so a chapter can still close with the model down. That wrapper was a bare
// `catch {}` returning null, and the client discarded the two values the route did hand back, so a
// writer got an empty queue and no reason. The handler's own comment claimed "the screen says which
// one did not run", which was the thing it did not do.
//
// The EMPTY case is asserted first and it is the half that matters: a report drawn when nothing
// failed would be a permanent red box on a screen a writer sees after every chapter.
{
  const closeChapter = async () => {
    click({ endchapter: 'ask' });            // arms
    click({ endchapter: 'ask' });            // and closes
    await new Promise((r) => setTimeout(r, 60));
    return html('sideBody');
  };

  endPasses = undefined;
  let side = await closeChapter();
  assert.doesNotMatch(side, /did not run/,
    'a close where everything ran draws no failure report');

  // One pass down. The reason is the model's own words, so it has to be printed rather than
  // classified — "the model did not answer" and "nothing to read in this chapter" send a writer
  // to two different places.
  endPasses = { summary: null, memory: null, facts: 'the model did not answer', finished: null };
  side = await closeChapter();
  assert.match(side, /One pass did not run/, 'a failed pass is reported, and counted');
  assert.match(side, /the facts pass/, 'named as the writer knows it');
  assert.match(side, /the model did not answer/, 'with the reason, verbatim');
  // NOT AS A LOST CHAPTER. The prose is committed before any of the four run, and a writer who
  // reads this box has to know that before they go looking for their words.
  assert.match(side, /Nothing was lost/, 'and says the chapter itself closed');
  // The three that ran are not listed. A report that names all four every time is a report nobody
  // reads to the end.
  assert.doesNotMatch(side, /the character memory/, 'and a pass that ran is not in the list');

  endPasses = { summary: 'llama-server is not running', facts: 'llama-server is not running' };
  side = await closeChapter();
  assert.match(side, /2 passes did not run/, 'two failures are counted as two');
  assert.match(side, /the summary/, 'both are named');
  assert.match(side, /the facts pass/, 'both are named');

  endPasses = undefined;
  ok('a chapter close reports which of its four passes did not run, and why (#32)');

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
  side = await closeChapter();
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
   * needed two attempts. The close handler sets `S.setupStep = 'cards'` itself, so a test that only
   * closes a chapter passes on that — and says nothing about the state Seth was in, which is a
   * reload later with `S.setupStep` and `S.ritualOf` both gone.
   *
   * `skipsetup` clears `S.setupStep` (and only that), so it stands in for the reload exactly: the
   * next open has no remembered step and must fall back on the DATA. */
  click({ skipsetup: '1' });
  await new Promise((r) => setTimeout(r, 20));
  click({ panel: 'setup' });
  await new Promise((r) => setTimeout(r, 30));
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
  await new Promise((r) => setTimeout(r, 20));
  click({ panel: 'setup' });
  await new Promise((r) => setTimeout(r, 30));
  assert.deepStrictEqual(litStep(html('sideBody')), ['more'],
    'a close that proposed only NEW threads opens on Anyone new, where they now live');
  const anyoneNew = html('sideBody');
  assert.match(anyoneNew, /The ferryman/, 'and the card is on that step');
  assert.match(anyoneNew, /data-invent=/, 'beside the tray that asks for another — the same thing');

  /* AND THE TWO KINDS DO NOT BLEED, which needs BOTH present at once: with only new threads the
   * panel redirects off the empty cards step, so "the ferryman is not on the cards step" was true
   * for the wrong reason and would have passed on no split at all. */
  STORY.proposals.push({ id: 'pr-old', entryId: 'e-1', title: 'Envoy Sereth',
    body: 'She has stopped waiting.', entryType: 'character', keys: [], kind: 'changed',
    delta: 'stopped waiting', chapterId: 'c-1' } as any);
  click({ setupstep: 'cards' });
  await new Promise((r) => setTimeout(r, 30));
  const whatLeft = html('sideBody');
  assert.deepStrictEqual(litStep(whatLeft), ['cards'], 'the cards step is reachable with a change on it');
  assert.match(whatLeft, /stopped waiting/, 'and holds what the chapter changed');
  assert.doesNotMatch(whatLeft, /The ferryman/,
    'a new thread must not also sit under What it left — that step is what changed');
  // The count on the rail is per step, so each says what IT owes rather than the whole queue.
  assert.match(whatLeft, /1 &middot; What it left <span[^>]*>1</, 'one change owed on step one');
  assert.match(whatLeft, /3 &middot; Anyone new <span[^>]*>1</, 'and one new thread on step three');

  click({ setupstep: 'more' });
  await new Promise((r) => setTimeout(r, 30));
  assert.doesNotMatch(html('sideBody'), /stopped waiting/,
    'and a change must not sit under Anyone new either');
  STORY.proposals = STORY.proposals.filter((p: any) => !['pr-new', 'pr-old'].includes(p.id));
  click({ skipsetup: '1' });
  await new Promise((r) => setTimeout(r, 20));
  click({ panel: 'setup' });
  await new Promise((r) => setTimeout(r, 30));
  assert.deepStrictEqual(litStep(html('sideBody')), ['premise'],
    'and with nothing owed from a closed chapter it opens on the next chapter');
  /* ANYONE NEW IS THE ACCENTED PRESS ON THE BEAT STEP, AND IT IS FIRST. Seth, 2026-09-01: "make the
   * anyone new button the accented one and move it to the top above save and write."
   *
   * Asserted as an ORDER and as an exclusive accent, not as "the button exists": it was already
   * there, below Save and write, wearing the ghost style. A check for its presence was green
   * throughout. */
  click({ setupstep: 'premise' });
  await new Promise((r) => setTimeout(r, 30));
  const beat = html('sideBody');
  const at = (re) => beat.search(re);
  const anyone = at(/<button class="btn" data-setupstep="more"/);
  const saveWrite = at(/data-savesetup="1"/);
  assert.ok(anyone > -1, 'Anyone new is the accented button — class "btn", not "btn ghost"');
  assert.ok(saveWrite > -1, 'and Save and write is still there');
  assert.ok(anyone < saveWrite, 'with Anyone new above it');
  assert.match(beat, /<button class="btn ghost" data-savesetup="1"/,
    'Save and write gives up the accent — one accent per screen, and it is the way out rather than '
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
    await new Promise((r) => setTimeout(r, 20));
    click({ skipsetup: '1' });
    await new Promise((r) => setTimeout(r, 20));
    click({ panel: 'setup' });
    await new Promise((r) => setTimeout(r, 30));
    assert.deepStrictEqual(litStep(html('sideBody')), ['premise'],
      'a queue from two chapters back is not a debrief — it opens on the next chapter');
    assert.doesNotMatch(html('sideBody'), /Two chapters ago/, 'and does not draw it');
    STORY.proposals = wasProps;
    STORY.chapters = wasChapters; STORY.currentChapter = wasCurrent;
  }
  ok('a close lands the writer on the cards it proposed, a reload still does, and Anyone new leads');
}

// ---- A PANEL'S SAVE IS AT THE TOP AND PINNED (issue #33). Seth, 2026-08-31: "All save buttons
// must be at the top and should be sticky."
//
// Three panels have a Save that commits the WHOLE panel, and all three are long enough to scroll on
// a phone: Story, Chapter and Storyteller. Storyteller's was the last element on the longest panel
// in the app.
//
// SCOPED, and the scope is the point. The card form's head has been sticky since it was written, so
// it is the pattern rather than a fourth copy. The per-item saves — one per outfit, per state, per
// addon, per mode prompt — stay beside the thing they save: there are many of them on one screen
// and "at the top" has no meaning for a button that belongs to the third card in a list. Seth's
// call, asked and answered 2026-08-31.
{
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
  assert.match(css, /\.savebar\s*\{[^}]*position:\s*sticky/,
    '.savebar must actually be sticky — the class is the whole mechanism');
  assert.match(css, /\.savebar\s*\{[^}]*top:\s*0/, 'and pinned to the top of the scrolling panel');
  // #sideBody is the scroll container, and it is only that because it carries `.scroll`. Sticky
  // against a non-scrolling ancestor silently does nothing, which is the failure this catches.
  assert.match(css, /id="sideBody" class="scroll"/,
    '#sideBody must carry .scroll or nothing in the panel can be sticky against it');

  for (const [panel, label] of [['story', 'Story'], ['chapter', 'Chapter'], ['teller', 'Storyteller']]) {
    click({ panel });
    await new Promise((r) => setTimeout(r, 40));
    const body = html('sideBody');
    const bar = body.match(/<div class="savebar">[\s\S]*?<\/div>/)?.[0] ?? '';
    assert.ok(bar, `the ${label} panel draws a .savebar`);
    assert.match(bar, /data-save(story|gen)="1"/, `and the ${label} panel's Save is inside it`);
    // AT THE TOP, which is the half a class name cannot promise. Measured as a position in the
    // markup rather than trusted: the bar has to come before the first field on the panel.
    const barAt = body.indexOf('class="savebar"');
    const firstField = body.search(/class="field"|type="range"/);
    assert.ok(firstField === -1 || barAt < firstField,
      `the ${label} panel's Save must come before its first field `
      + `(bar at ${barAt}, first field at ${firstField})`);
    // AND EXACTLY ONE. Moving a button is how you end up with two of it.
    assert.strictEqual((body.match(/data-save(story|gen)="1"/g) ?? []).length, 1,
      `the ${label} panel has exactly one whole-panel Save`);
  }
  ok('Story, Chapter and Storyteller each pin one Save above their fields (#33)');
}

// ---- THE RE-ROLL INSTRUCTION IS EDITABLE (issue #38). Seth, 2026-09-01: "I should be able to edit
// the regenerate command."
//
// A re-roll of a directed passage re-runs its stored instruction (`inherit()` in routes.ts). The
// writer could neither see it nor change it, so a passage written from a bad steer could only be
// re-rolled into the same bad steer for ever.
//
// The ABSENCE is asserted first and it is the half that would pass for the wrong reason: an
// undirected passage has no instruction to show and must still re-roll on one press.
{
  click({ open: 's-1' });
  await new Promise((r) => setTimeout(r, 40));

  // p-2 carries no directive: pressing Regenerate must not open an editor.
  POSTED.length = 0;
  click({ re: 'p-2' });
  await new Promise((r) => setTimeout(r, 40));
  assert.doesNotMatch(html('col'), /data-rerollbox/,
    'an undirected passage opens no editor — it re-rolls on the press, as it always has');

  // p-1 carries one: pressing Regenerate opens it, prefilled, and generates nothing yet.
  POSTED.length = 0;
  click({ re: 'p-1' });
  await new Promise((r) => setTimeout(r, 40));
  const doc = html('col');
  assert.match(doc, /data-rerollbox/, 'a directed passage opens its instruction for editing');
  assert.match(doc, /have the envoy arrive early/, 'prefilled with the instruction that made it');
  assert.match(doc, /data-rerollgo="p-1"/, 'with a Re-roll button naming that passage');
  assert.match(doc, /data-rerollx/, 'and a way out that changes nothing');
  assert.strictEqual(POSTED.filter((x: any) => String(x.url).startsWith('/api/generate')).length, 0,
    'and opening the editor generates NOTHING — the press used to fire immediately');

  // Cancel leaves the passage alone.
  click({ rerollx: '1' });
  await new Promise((r) => setTimeout(r, 40));
  assert.doesNotMatch(html('col'), /data-rerollbox/, 'Cancel closes it');
  assert.strictEqual(POSTED.filter((x: any) => String(x.url).startsWith('/api/generate')).length, 0,
    'and Cancel generates nothing either');
  ok('the re-roll instruction opens for editing, prefilled, and only on a passage that has one (#38)');
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
  await new Promise((r) => setTimeout(r, 60));

  const chapters = STORY.chapters.length;
  assert.ok(chapters > 1, `the fixture needs more than one chapter to tell these apart (${chapters})`);

  // Writing: one chapter's band only.
  const writing = html('col');
  const bandsWriting = (writing.match(/class="band"/g) ?? []).length;
  assert.strictEqual(bandsWriting, 1, 'writing draws exactly one chapter band');

  // Reading: one band per chapter.
  click({ readmode: '1' });
  await new Promise((r) => setTimeout(r, 60));
  const reading = html('col');
  const bandsReading = (reading.match(/class="band"/g) ?? []).length;
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
  await new Promise((r) => setTimeout(r, 60));
  assert.strictEqual((html('col').match(/class="band"/g) ?? []).length, 1,
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
  await new Promise((r) => setTimeout(r, 60));
  const doc = html('col');

  assert.match(doc, /class="cameback"/, 'an unclaimed passage this page did not watch is marked');
  assert.match(doc, /written while you were away/, 'and says what happened in words');
  // EXACTLY ONE. Every other fixture passage omits `claimed`, which an older server also omits, and
  // undefined must read as claimed rather than marking the whole book.
  assert.strictEqual((doc.match(/class="cameback"/g) ?? []).length, 1,
    'and only that one — a missing `claimed` field reads as claimed, not as unclaimed');
  // The prose is THERE, not hidden behind a decision. The row is real; that is the design.
  assert.match(doc, /The bell rang once and nobody came down for it\./,
    'the passage itself is on the page — it is in the book, not in a holding pen');
  // And its tray is the ordinary one, because editing, re-rolling and branching are exactly what
  // the writer might do before standing behind it.
  assert.match(doc, /data-re="p-4"/, 'it can be re-rolled like any other passage');
  assert.match(doc, /data-del="p-4"/, 'and discarded, which is what declining it means');

  ok('a passage written while you were away is marked, once, and is otherwise an ordinary passage');

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
  await new Promise((r) => setTimeout(r, 600));

  // THE PAGE WAITS FOR THE VEIL NOW (2026-09-02). Seth: "dont send the content to the main page
  // until that tap happens ... otherwise it overloads the browser." `paint()` rebuilt the whole
  // reading column while the typewriter was drawing a letter every 38ms behind a full-screen blur,
  // and the animation is what lost. So the repaint is handed to the veil and runs when it is
  // dismissed. Asserted in both directions, because "it repaints eventually" would pass on the old
  // behaviour and on a veil that never held anything back.
  assert.match(html('col'), /class="cameback"/,
    'the page must NOT be rebuilt while the veil is still up — that is the whole point of holding it');

  // Typing is one of the three ways out, and the one this harness can drive: the click stub's
  // `closest` answers every selector, so a fake tap looks like a tap on a button.
  typeIn('input', 'x');
  for (let i = 0; i < 40 && /class="cameback"/.test(html('col')); i++) {
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.doesNotMatch(html('col'), /class="cameback"/,
    'a passage this page watched arrive is not marked as having arrived while away');
  stubPassageId = undefined;
  ok('and watching one arrive unmarks it, without claiming it — once the veil is dismissed');
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
  await new Promise((r) => setTimeout(r, 40));
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

console.log(`\n${n} checks passed`);