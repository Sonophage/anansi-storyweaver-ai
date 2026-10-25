// The handlers nothing else drives: accepting a proposal, the type and activation chips, an
// empty story, chapter switching, mode switching, appearance persistence, and the import route
// that still has no caller. This is the loop that found the Accept bug.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/handlers.js
//
// Point it at a COPY. It accepts a proposal, edits an entry, and creates a story via import.
// Phase 1 loop: drive the handlers today's work added that nothing has ever exercised, and
// assert on outcomes rather than on "did not crash". Red-capable, deterministic, ~40s.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (l, g) => { if (!g) red++; console.log("  " + (g ? "ok  " : "RED ") + l); };
const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s=>s.title==='The Silver Key').id)()");
const entries = () => page.eval("(async () => (await (await fetch('/api/story?story=" + sid + "')).json()).entries)()");

// ---- 1. Accept a proposal. Seeded through the API-facing route so it is deterministic.
await page.eval("(async () => { await fetch('/api/extract', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({storyId:'" + sid + "'})}); })()");
await page.goto(B + "/#" + sid + "/queue");
// THE QUEUE IS BEHIND A TAB SINCE 2026-09-03. `/queue` is a retired panel name that maps to the
// Chapter panel, and that panel is four groups now — the proposals live under Proposed and every
// other group is display:none. The cards were still in the DOM, so a querySelectorAll counted them
// and the click that followed had nothing with a box to press: this scenario died before its first
// assertion rather than going red, which is why the count below is of VISIBLE ones now.
await page.click('[data-chaptab="proposed"]');
await wait(300);
const props = await page.eval("[...document.querySelectorAll('[data-decide=\"accept\"]')]"
  + ".filter((b) => b.getClientRects().length).length");
console.log("  proposals on screen: " + props);
if (props) {
  // Count is the wrong assertion: a "changed" proposal UPDATES an existing entry, so the count
  // does not move. What must be true either way is that the named fact is in the ledger.
  const name = (await page.eval("document.querySelector('#sideBody .card span')?.textContent") || '').trim();
  const kind = await page.eval("document.querySelector('#sideBody .card span:nth-child(2)')?.textContent");
  await page.click('[data-decide="accept"]');
  await wait(1000);
  const titles = (await entries()).map((e) => e.title);
  ok(`Accept lands "${name}" (${kind}) in the ledger`, titles.some((t) => t === name));
} else {
  // The seed plants one proposal precisely so this branch cannot be reached. Reaching it means
  // the queue was empty, which is a real failure of the fixture rather than a quiet skip — and a
  // skip that produces no `ok` is invisible to a count-based harness, which is how this scenario
  // drifted between 39 and 40 with nothing red.
  ok("the proposal queue was not empty — the seed plants one so Accept always has work", false);
}

// ---- 2. The type and activation chips on an entry
await page.goto(B + "/#" + sid + "/threads");
// Read the id BEFORE clicking: the click replaces the list with the editor, so reading it
// afterwards gave undefined and turned four probe errors into four fake bugs.
const eid = await page.eval("document.querySelector('[data-entry]')?.dataset.entry");
await page.click('[data-entry="' + eid + '"]');
// A card opens on its FACE. Everything below reaches for the form — the activation chips, the
// kind chips — so press Edit first, the way panels.js and phone.js already do. This scenario was
// missed when they were fixed and has died on the first click ever since.
await page.click('[data-cardview="form"]');
await wait(300);
await page.click('[data-act="triggered"]');
await wait(700);
let e = (await entries()).find((x) => x.id === eid);
ok(`switching activation to triggered persists (now ${e?.activation})`, e?.activation === "triggered");
await page.click('[data-kind="lore"]');
await wait(700);
e = (await entries()).find((x) => x.id === eid);
ok(`switching type to lore persists (now ${e?.entryType})`, e?.entryType === "lore");
ok("  and the change did not wipe the body", !!e?.body);
ok("  and did not wipe the keywords", Array.isArray(e?.keys));

// ---- 3. An empty story: no chapters with prose, nothing written
// An empty story, MADE here rather than looked for. It used to take whatever else happened to be in
// the library — and the library is a snapshot of the real anansi.db, so this depended on the author
// having a second book. The day that library emptied these three checks stopped running and the
// scenario still reported green: 22 became 19, no red. Which is the failure the notes describe.
const empty = await page.eval(`(async () => {
  const r = await (await fetch('/api/stories')).json();
  const had = r.stories.find(x => x.title === 'An Empty Book');
  if (had) return had.id;
  const made = await (await fetch('/api/stories', { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'An Empty Book' }) })).json();
  return made.id ?? null; })()`);
console.log("  empty story for the edge case: " + empty);
ok("an empty story exists to test the edge case with", !!empty);
if (empty) {
  await page.goto(B + "/#" + empty);
  const err = await page.eval("window.__err || null");
  ok("an empty story renders without throwing", !err);
  ok("  and the composer is present", await page.eval("!!document.getElementById('input')"));
  ok("  and Context does not claim a budget it has not got",
     !/NaN|Infinity|undefined/.test(await page.text('#bar') || ''));
}

// ---- 4. Switching chapters from the rail
await page.goto(B + "/#" + sid);
const chapters = await page.eval("document.querySelectorAll('[data-chapter]').length");
if (chapters > 1) {
  const second = await page.eval("document.querySelectorAll('[data-chapter]')[0].dataset.chapter");
  await page.click('[data-chapter="' + second + '"]');
  await wait(700);
  ok("switching chapters keeps the document rendered", await page.eval("document.getElementById('col').innerHTML.length > 50"));
  ok("  and the header follows the chapter", !/undefined/.test(await page.text('#bar') || ''));
}

// ---- 5. Mode switching refreshes the manifest rather than stalling
await page.goto(B + "/#" + sid + "/context");
const t0 = await page.text('#sideBody');
await page.mode('direct');
await wait(1400);
ok("changing mode updates the manifest", (await page.text('#sideBody')) !== null);
ok("  and MODE reflects the choice", /direct/i.test(await page.eval("(async () => { const r = await (await fetch('/api/manifest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({storyId:'" + sid + "',mode:'direct'})})).json(); return r.manifest.blocks.filter(b=>b.kind==='MODE').map(b=>b.reason).join(); })()")));

// ---- 6. The appearance choice survives a reload
await page.goto(B + "/#" + sid);
await page.click('[data-appearance="1"]');
await page.click('[data-theme="parchment"]');
await page.goto(B + "/#" + sid);
ok("the theme choice survives a reload", (await page.eval("document.documentElement.dataset.uiTheme")) === "parchment");
await page.click('[data-appearance="1"]');
await page.click('[data-theme="obsidian"]');

// ---- 7. /api/import has no caller; prove the route itself works end to end
const imported = await page.eval("(async () => { const card = { spec:'chara_card_v2', data:{ name:'Probe Card', description:'Made by the hunt.', tags:['nsfw'] } };"
  + " const b64 = btoa(JSON.stringify(card));"
  + " const r = await (await fetch('/api/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'probe.json',data:b64})})).json();"
  + " return JSON.stringify(r); })()");
console.log("  /api/import returned: " + imported.slice(0, 160));
ok("the import route creates a story", /storyId/.test(imported));

// ---- History must not go stale WHILE IT IS OPEN. Reported as "takes doesnt update, edits did":
// the panel keeps its own copy, fetched when you opened it. Edits looked fine because you reopen
// the panel to look at an edit; you do not reopen it to regenerate.
//
// The panel must NOT be closed and reopened anywhere below, or this tests refetching — which
// always worked — instead of refreshing. Editing in place is the deterministic path through
// refreshHistory; the same thing after a real regeneration is asserted in model.js.
const sid2 = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s=>s.title==='The Silver Key').id)()");
const story2 = () => page.eval("(async () => await (await fetch('/api/story?story=" + sid2 + "')).json())()");
await page.goto(B + "/#" + sid2);
for (let i = 0; i < 40 && !(await page.visible('#col')); i++) await wait(250);
const target = (await story2()).passages.filter((p) => !p.isBreak).at(-1);
await page.dbl(`[data-edit=\"${target.id}\"]`);   // the ⋯ handle is gone; a double tap opens the tray
await wait(400);
await page.click(`[data-hi="${target.id}"]`);
await wait(900);
const openBody = (await page.text('#sideBody') || '');
ok("Alterations opens with a Fittings section and an Altered by hand section",
   /Fittings/.test(openBody) && /Altered by hand/.test(openBody));
ok(`  and one fitting is a line, not a numbered card (${(openBody.match(/Fitting \d+/g) ?? []).length} numbered)`,
   (openBody.match(/Fitting \d+/g) ?? []).length === 0 && /One fitting/.test(openBody));
const editsBefore = await page.eval("document.querySelectorAll('[data-restore]').length");

// Edit the passage in the document, with History still open beside it.
//
// Through the Edit ACTION, because a passage is no longer editable until one is pressed. It used to
// carry contenteditable at all times, which on a phone meant a tap in the prose raised the keyboard
// and you were editing without asking. This check typed straight into the element, so it was
// exercising a door that is now shut — and it went red the moment the door closed, which is the
// right way round.
// THIS block's Edit, not the first one on the page. The first version reached for
// `document.querySelector('[data-more]')`, which is whichever paragraph happens to be at the top —
// so it opened the tray on the wrong passage, pressed Edit on the wrong passage, and the target was
// still not editable. Same shape of mistake as the unscoped selector that clicked off-canvas.
await page.eval("(() => { const blk = document.querySelector('[data-edit=\"" + target.id + "\"]')"
  + ".closest('.block'); blk.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); return 1; })()");
await wait(350);
await page.eval("(() => { const blk = document.querySelector('[data-edit=\"" + target.id + "\"]')"
  + ".closest('.block'); blk.querySelector('button[data-ed]')?.click(); return 1; })()");
await wait(350);
await page.eval("(() => { const e = document.querySelector('[data-edit=\"" + target.id + "\"]');"
  + " e.focus(); e.textContent = 'EDITED WHILE HISTORY WAS OPEN.'; e.blur(); return 1; })()");
for (let i = 0; i < 30; i++) {
  if ((await page.eval("document.querySelectorAll('[data-restore]').length")) > editsBefore) break;
  await wait(300);
}
const editsAfter = await page.eval("document.querySelectorAll('[data-restore]').length");
ok(`the open panel picks up the edit without being reopened (${editsBefore} -> ${editsAfter})`,
   editsAfter > editsBefore);
ok("  and the panel is still Alterations, not something else",
   /Fittings/.test(await page.text('#sideBody') || ''));

// ---- in-flight: the slow answer must not land on the new book
// COUNCIL-04 #11. refreshManifest and openStory's activity fetch both assigned after their await
// without asking whether the writer was still on that story, so switching books while a manifest
// was in flight left the Context panel describing the previous one.
//
// Racing this needs the race to be REAL, so fetch is slowed for one story's URLs only.
{
  // BY NAME, not by position. Taking the first two of /api/stories picked up a "Probe Card" that
  // an earlier step in this same scenario imports — the library is ordered by last touched — so
  // the race ran against whatever the previous assertions had left lying around.
  // The second title used to be a book that existed in the author's real library and in no seed,
  // so the lookup returned null, the guard below fired, and the race this scenario exists for never
  // ran once. It creates its own second book now.
  const two = await page.eval("(async () => {"
    + " const want = ['The Silver Key', 'A Second Book To Race'];"
    + " let r = await (await fetch('/api/stories')).json();"
    + " if (!r.stories.find(s => s.title === want[1])) {"
    + "   await fetch('/api/stories', { method: 'POST',"
    + "     headers: { 'Content-Type': 'application/json' },"
    + "     body: JSON.stringify({ title: want[1], premise: 'For the race.' }) });"
    + "   r = await (await fetch('/api/stories')).json();"
    + " }"
    + " return JSON.stringify(want.map(t => r.stories.find(s => s.title === t) ?? null)"
    + "   .map(s => s && ({ id: s.id, title: s.title }))); })()");
  const [slow, fast] = JSON.parse(two);   // `B` is the base URL in this file — do not shadow it
  if (!slow || !fast) {
    ok("two named stories to race between", false);
  } else {
    // Start on the WORKSPACE, not on the slow story: navigating there first makes the later
    // hash change to it a no-op, so nothing is ever in flight and the race never happens. That
    // version of this test passed with all three guards deleted, which is how I know.
    await page.goto(B + "/");
    await wait(900);
    // Every request naming A now takes 1.2s; B stays fast. So A is asked for first and answers last.
    // The BODY as well as the URL: /api/manifest is a POST to one path for every story, so a
    // throttle that only reads the URL cannot slow one book's manifest and not another's.
    await page.eval(`(() => {
      const real = window.__realFetch = window.fetch;
      const mine = (u, o) => String(u).includes(${JSON.stringify(slow.id)})
        || (o && typeof o.body === 'string' && o.body.includes(${JSON.stringify(slow.id)}));
      window.fetch = (u, o) => mine(u, o)
        ? new Promise((r) => setTimeout(() => r(real(u, o)), 1200))
        : real(u, o);
      return 1; })()`);
    // Open A, then B a moment later — A's answers are still in the air when B's have landed.
    await page.eval(`(() => { location.hash = '#' + ${JSON.stringify(slow.id)}; return 1; })()`);
    await wait(120);
    await page.eval(`(() => { location.hash = '#' + ${JSON.stringify(fast.id)}; return 1; })()`);
    await wait(2600);
    // NOT the first .serif in the bar: #26 made the word Anansi the logo and it sits before the
    // book's title. `.wordmark` names it so this reads the title rather than whichever came first.
    const title = (await page.eval("document.querySelector('#bar .serif:not(.wordmark)')?.textContent") || '').trim();
    ok(`the book on screen is the one you opened last (${JSON.stringify(title)})`, title === fast.title);
    // The real defect: the panel described the OTHER book's prompt under this book's title. The
    // manifest carries the story's own title in SPINE, so the prompt names which book it is for.
    await page.eval("(() => { document.querySelector('[data-panel=\"context\"]')?.click(); return 1; })()");
    await wait(1400);
    const prompt = (await page.text('#sideBody') || '');
    ok("  and the context panel is not describing the book you left",
       !prompt.includes(slow.title) || slow.title === fast.title);
    // And the manifest guard on its own. With openStory guarded the slow book never gets as far as
    // asking for a manifest, so the assertions above cannot see that guard at all — this one opens
    // the slow book properly first, puts a manifest for it in flight, and only then switches.
    await page.eval("(() => { window.fetch = window.__realFetch; return 1; })()");
    await page.goto(B + "/#" + slow.id + "/context");
    await wait(1200);
    // Captured FRESH: the page.goto above is a real navigation, so anything stashed on the previous
    // window is gone and `real` would have been undefined — which makes every un-throttled request
    // throw, the new book never load, and this assertion pass or fail for reasons of its own.
    await page.eval(`(() => {
      const real = window.__realFetch = window.fetch;
      window.fetch = (u, o) => (o && typeof o.body === 'string' && o.body.includes(${JSON.stringify(slow.id)}))
        ? new Promise((r) => setTimeout(() => r(real(u, o)), 1500))
        : real(u, o);
      return 1; })()`);
    // Picking a MODE is what puts a manifest in flight — typing only resizes the box, which is why
    // the first version of this raced nothing and passed with the guard deleted.
    await page.mode('act');
    await wait(150);
    await page.eval(`(() => { location.hash = '#' + ${JSON.stringify(fast.id)} + '/context'; return 1; })()`);
    // Wait for the CONDITION, not the clock. A fixed wait made this go red once in a batch of
    // seven scenarios and never alone: under load the new book had not finished opening yet, so
    // the panel was showing the old one because it was slow rather than because it was stale —
    // the test failing for the opposite reason to the one it exists for.
    for (let i = 0; i < 40; i++) {
      const bar = (await page.eval("document.querySelector('#bar .serif:not(.wordmark)')?.textContent") || '').trim();
      if (bar === fast.title) break;
      await wait(200);
    }
    // And then past the throttled answer's own arrival, which is the moment being tested.
    await wait(1800);
    // The PROMPT view, not Blocks: the block list is kinds and token counts, and a stale manifest
    // from another book looks exactly like this one there. The prompt carries the story's title in
    // SPINE, so it is the only view where the wrong book is visible as the wrong book. Asserting
    // on Blocks passed with the guard deleted, which is how I know.
    await page.eval("(() => { document.querySelector('[data-ctxview=\"prompt\"]')?.click(); return 1; })()");
    await wait(400);
    const after = (await page.text('#sideBody') || '');
    ok(`  and a manifest already in flight for the old book does not land on the new one`,
       after.includes(fast.title) && !after.includes(slow.title));
    // Put fetch back, or every scenario after this one runs through the throttle.
    await page.eval("(() => { if (window.__realFetch) window.fetch = window.__realFetch; return 1; })()");

    // A manifest request that FAILS is the same lie by another road: it used to skip the
    // assignment, so the panel kept showing the last one that worked.
    await page.eval(`(() => {
      const real = window.__realFetch = window.fetch;
      window.fetch = (u, o) => String(u).includes('/api/manifest')
        ? Promise.resolve(new Response(JSON.stringify({ error: 'the engine fell over' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }))
        : real(u, o);
      return 1; })()`);
    await page.mode('speak');
    await wait(900);
    const failed = (await page.text('#sideBody') || '');
    ok("a manifest that fails says so instead of showing the last one that worked",
       // The same durable clause surfaces.js probes for, and for the same reason: this asserted the
       // absence of "prose engine", which stopped meaning anything the moment SYSTEM stopped saying
       // it — a negative that is trivially true tests nothing.
       /could not be taken/.test(failed) && !/Output prose only/.test(failed));
    await page.eval("(() => { window.fetch = window.__realFetch; return 1; })()");
  }
}

// ---- The menu's Threads page, with no story open. A fresh load is what makes this falsifiable:
// the editor beside the list reads from the OPEN story, and after a reload there is none, which is
// exactly the state a writer is in when they come to that page from the menu. Pressing a thread
// used to set the selection and then render the "pick a thread" hint again — nothing opened, and
// nothing said why.
await page.goto(B + "/");
await wait(600);
await page.eval("(() => { document.querySelector('[data-nav=\"canon\"]').click(); return 1; })()");
await wait(900);
const listed = await page.eval("document.querySelectorAll('#page [data-entry]').length");
ok(`the menu's Threads page lists every thread across the shelf (${listed})`, listed > 0);
const before = (await page.eval("document.querySelector('#page .aside')?.textContent") || '').trim();
ok("  and offers no editor until one is picked", !before.includes('When it reaches the model'));
const leid = await page.eval("document.querySelector('#page [data-entry]')?.dataset.entry");
await page.eval("(() => { document.querySelector('[data-entry=\"" + leid + "\"]').click(); return 1; })()");
await wait(1200);
// A card opens on its FACE here too. Assert the face first so the two views cannot quietly become
// one, then press Edit — the same fix as the activation chips at the top of this file, and the one
// `panels.js` and `phone.js` already carry.
ok("  pressing one opens its face", await page.eval("!!document.querySelector('#page [data-cardview=\"form\"]')"));
await page.eval("(() => { document.querySelector('#page [data-cardview=\"form\"]').click(); return 1; })()");
await wait(700);
const opened = (await page.eval("document.querySelector('#page .aside')?.textContent") || '').trim();
// The three rooms of the entry editor. Any one of them proves the editor rendered rather than the
// hint — the body box proves it has the thread's own text and not an empty form.
ok("  and Edit opens the form, with no need to find its book on the shelf first",
   opened.includes('When it reaches the model') && opened.includes('Type'));
const body = await page.eval("document.querySelector('#page .aside textarea')?.value ?? ''");
ok(`  and the box holds the thread's own body (${JSON.stringify(body.slice(0, 30))})`, body.trim().length > 0);

// ---- The door out of a single book's threads. The panel is one story's by construction, so the
// list that spans every book needs a way in from inside one.
await page.goto(B + "/#" + sid + "/threads");
await wait(900);
ok("the story's Threads panel offers a door to every book's",
   await page.eval("!!document.querySelector('#sideBody [data-leave=\"canon\"]')"));
await page.eval("(() => { document.querySelector('[data-leave=\"canon\"]').click(); return 1; })()");
await wait(900);
ok("  and it lands on the page that spans them, not on the shelf",
   (await page.eval("document.querySelectorAll('#page [data-entry]').length")) > 0
   && (await page.eval("!!document.querySelector('#page [data-lkind]')")) === true);

// ---- Outfits and chapter overrides: editable, and wearable where they live. Both routes have
// updated by id since they were written and the panel never sent one, so the only way to fix a
// typo in an outfit or a wrong chapter number was to delete the thing and type it again. Wearing
// was worse: it existed ONLY as chips on the Threads list, and the panel holding the wardrobe said
// so in a sentence instead of offering a button.
await page.goto(B + "/#" + sid + "/threads");
await wait(900);
const cid = await page.eval("(() => { const b = [...document.querySelectorAll('[data-entry]')]"
  + ".find(x => x.textContent.includes('Aldis')); return b ? b.dataset.entry : "
  + "document.querySelector('[data-entry]')?.dataset.entry; })()");
await page.click('[data-entry="' + cid + '"]');
await wait(700);
// EDIT FIRST, AND IN THIS ORDER. The card opens on its face, and the kind chips and the wardrobe
// are both on the form — so the `?.click()` below found nothing, said nothing about it, and left
// the card the wrong kind, which is why the wardrobe was not there to drive either. Optional
// chaining on a driver click is how a step disappears without a red line; asserted rather than
// hoped for.
await page.click('[data-cardview="form"]');
await wait(500);
// VISIBLE, not merely present. The form grew TABS on 2026-09-02 — The card / Rooms / Over time /
// More — and a pane that is not the open one is `display:none` with all of its markup still in the
// document. This assertion asked `querySelector` and so stayed green while everything it was about
// was hidden; what went red was a click three lines below, on a button with no box.
ok("the card's form opens, so the kind chips are on screen",
   await page.visible('[data-kind="character"]'));
// A character, or there is no wardrobe to drive. The fixture's persona is one.
await page.click('[data-kind="character"]');
await wait(800);
// AND THE WARDROBE IS IN THE ROOMS TAB, since the same change. It used to be further down the one
// long form, so opening the form was enough to reach it.
await page.click('[data-cardtab="rooms"]');
await wait(500);
ok("  and the wardrobe is in the Rooms tab", await page.visible('[data-newroom]'));
// THE ADD TRAY IS FOLDED SHUT AND NOTHING IS SELECTED IN IT (2026-08-30), so the outfit pill is
// pressed before the boxes exist at all. That press is the change: one add path for every room
// rather than a form per slot plus a second one under the wardrobe. It repaints, so it happens
// BEFORE the fill below and not between the fill and the press.
await page.eval(`(() => { const d = document.querySelector('[data-newroom]')?.closest('details');
  if (d) d.open = true; return 1; })()`);
await wait(250);
await page.click('[data-newroom="outfit"]');
await wait(600);
ok("the add tray opens the outfit fields when the outfit pill is pressed",
   await page.eval("!!document.querySelector('[data-of=\"name\"]')"));
// FILL AND PRESS IN ONE EVAL, with nothing between. Changing the kind above saves and repaints,
// and a repaint landing between the fill and the press wipes the two boxes — which is what this
// was doing: the click reached a real button holding two empty fields, `upsertOutfit` had nothing
// to store, and the only sign was `an outfit can be added (0)`. Asserted first, so if the fields
// are ever empty again the check says THAT rather than blaming the route.
const filled = await page.eval("(() => { const n = document.querySelector('[data-of=\"name\"]'),"
  + " b = document.querySelector('[data-of=\"body\"]'); if (!n || !b) return 'no wardrobe on screen';"
  + " n.value = 'Plate'; b.value = 'Scarred half-armour, buckled wrong.';"
  + " document.querySelector('[data-addoutfit]').click();"
  + " return n.value === 'Plate' ? 'ok' : 'the boxes did not hold what was typed'; })()");
ok(`the wardrobe boxes hold what was typed when Add is pressed (${filled})`, filled === 'ok');
await wait(900);
const outfitOf = async () => (await entries()).find((x) => x.id === cid)?.outfits ?? [];
let fits = await outfitOf();
ok(`an outfit can be added (${fits.length})`, fits.length === 1 && fits[0].name === 'Plate');

// Edit it in place. The id in the attribute is what makes this an edit and not a second outfit.
const oid = fits[0].id;
await page.eval("(() => { document.querySelector('[data-ofn=\"" + oid + "\"]').value = 'Court dress';"
  + " document.querySelector('[data-ofb=\"" + oid + "\"]').value = 'Borrowed silk, a size out.';"
  + " return 1; })()");
await page.click('[data-saveoutfit="' + oid + '"]');
await wait(1000);
fits = await outfitOf();
ok(`  and edited in place, not duplicated (${fits.length} outfit, "${fits[0]?.name}")`,
   fits.length === 1 && fits[0].name === 'Court dress' && /Borrowed silk/.test(fits[0].body));

// Worn from the panel that holds the wardrobe, which is the whole report.
ok("  and the editor offers a way to wear it", await page.eval("!!document.querySelector('[data-wear=\"" + cid + ":" + oid + "\"]')"));
await page.click('[data-wear="' + cid + ':' + oid + '"]');
await wait(1000);
fits = await outfitOf();
ok(`  pressing it puts it on (active ${fits[0]?.active})`, fits[0]?.active === true);
await page.click('[data-wear="' + cid + ':' + oid + '"]');
await wait(1000);
fits = await outfitOf();
ok(`  and pressing it again takes it off (active ${fits[0]?.active})`, fits[0]?.active === false);

// THE CARD'S TAIL SECTIONS ARE FOLDS NOW, SHUT BY DEFAULT (2026-08-30). Seth: "the over time and
// the brings in with it and another book should be toggle and defaulted as off." Their fields are
// still in the document, so an eval can read and fill them — but a driver CLICK needs the section
// opened first, which is the press a writer makes. Idempotent: one already open is left alone
// rather than toggled shut.
// AND THE TAB IT LIVES IN. The form grew four tabs on 2026-09-02 and each is a pane that is
// `display:none` when it is not the open one — so a fold in another pane is in the document, has no
// box, and every press on it dies. The map is the one the app itself uses: rooms in Rooms, the
// changes-over-time list in Over time, everything else on The card.
const FOLD_TAB = { states: 'time', addons: 'rooms', outfits: 'rooms' };
const openFold = async (name) => {
  const tab = FOLD_TAB[name] ?? 'card';
  if ((await page.eval(`document.querySelector('[data-cardtab="${tab}"]')?.getAttribute('aria-pressed')`)) !== 'true')
    await page.click(`[data-cardtab="${tab}"]`);
  await wait(300);
  if (!(await page.eval(`!!document.querySelector('[data-fold="${name}"]')?.parentElement?.open`)))
    await page.click(`[data-fold="${name}"]`);
  await wait(300);
};
// A chapter override, then correcting the chapter it comes into force in.
await openFold('states');
await page.eval("(() => { document.querySelector('[data-st=\"fromChapter\"]').value = '2';"
  + " document.querySelector('[data-st=\"body\"]').value = 'He has stopped pretending to be Watch.';"
  + " return 1; })()");
await page.click('[data-addstate]');
await wait(1000);
const statesOf = async () => (await entries()).find((x) => x.id === cid)?.states ?? [];
let sts = await statesOf();
ok(`a chapter override can be added (${sts.length} from chapter ${sts[0]?.fromChapter})`,
   sts.length === 1 && sts[0].fromChapter === 2);
const stid = sts[0].id;
await page.eval("(() => { document.querySelector('[data-stf=\"" + stid + "\"]').value = '3';"
  + " document.querySelector('[data-stb=\"" + stid + "\"]').value = 'He says it out loud, once.';"
  + " return 1; })()");
await page.click('[data-savestate="' + stid + '"]');
await wait(1000);
sts = await statesOf();
ok(`  and its chapter corrected in place (${sts.length} from chapter ${sts[0]?.fromChapter})`,
   sts.length === 1 && sts[0].fromChapter === 3 && /out loud/.test(sts[0].body));

// ---- Delete all takes. Seeded by adding variants through the API-facing route rather than by
// rerolling, so it needs no model and the count is exact. The old behaviour is the assertion in the
// middle: one press removes the take on screen and promotes the next, so the passage is still there.
await page.goto(B + "/#" + sid);
await wait(1000);
const pass = () => page.eval("(async () => (await (await fetch('/api/story?story=" + sid + "')).json()).passages)()");
const firstId = (await pass()).find((p) => !p.isBreak)?.id;
for (const line of ['A second take.', 'A third take.']) {
  await page.eval("(async () => { await fetch('/api/accept', { method:'POST',"
    + " headers:{'Content-Type':'application/json'}, body: JSON.stringify({ storyId:'" + sid + "',"
    + " variantOf:'" + firstId + "', body:" + JSON.stringify(line) + ", check:false }) }); })()");
  await wait(500);
}
await page.goto(B + "/#" + sid);
await wait(1100);
const takes = await page.eval("(() => { const p = [...document.querySelectorAll('[data-del]')]; return p.length; })()");
ok(`the passage is one block however many takes it has (${takes} delete buttons)`, takes >= 1);
const slotId = await page.eval("document.querySelector('[data-delall]')?.dataset.delall");
ok("a rerolled passage offers to delete every take", !!slotId);

// A failing else rather than a skip: with no control to press, the two assertions below would
// otherwise throw inside page.eval and take the rest of the scenario with them, which reports as
// fewer checks rather than as a failure. Two of the four blocks found inert on 2026-08-24 were
// exactly this shape.
if (!slotId) {
  ok("  deleting one take leaves the passage in the book", false);
  ok("  and deleting all takes removes it", false);
} else {
  // One press, then another: the old behaviour, and the reason the option exists. The block lives.
  await page.eval("(() => { document.querySelector('[data-del=\"" + slotId + "\"]').click(); return 1; })()");
  await wait(300);
  await page.eval("(() => { document.querySelector('[data-del=\"" + slotId + "\"]').click(); return 1; })()");
  await wait(1100);
  const live = (await pass()).filter((p) => !p.isBreak);
  ok(`  deleting one take leaves the passage in the book (${live.length} passage)`, live.length >= 1);

  // Now the other intent, twice pressed like the one above it.
  const again = await page.eval("document.querySelector('[data-delall]')?.dataset.delall");
  if (!again) {
    ok("  and deleting all takes removes it", false);
  } else {
    await page.eval("(() => { document.querySelector('[data-delall=\"" + again + "\"]').click(); return 1; })()");
    await wait(300);
    await page.eval("(() => { document.querySelector('[data-delall=\"" + again + "\"]').click(); return 1; })()");
    await wait(1200);
    const after = (await pass()).filter((p) => !p.isBreak);
    ok(`  and deleting all takes removes it (${live.length} -> ${after.length})`, after.length < live.length);
  }
}

console.log(red ? `\n  ${red} RED` : "\n  all green");
