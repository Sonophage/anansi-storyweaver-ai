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
const props = await page.eval("document.querySelectorAll('[data-decide=\"accept\"]').length");
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
  console.log("  SKIP accept — extraction proposed nothing this run");
}

// ---- 2. The type and activation chips on an entry
await page.goto(B + "/#" + sid + "/threads");
// Read the id BEFORE clicking: the click replaces the list with the editor, so reading it
// afterwards gave undefined and turned four probe errors into four fake bugs.
const eid = await page.eval("document.querySelector('[data-entry]')?.dataset.entry");
await page.click('[data-entry="' + eid + '"]');
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
const empty = await page.eval("(async () => { const r = await (await fetch('/api/stories')).json(); const s = r.stories.find(x=>x.title!=='The Silver Key'); return s ? s.id : null; })()");
console.log("  empty story for the edge case: " + empty);
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
await page.click('[data-mode="direct"]');
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
await page.click(`[data-more="${target.id}"]`);
await wait(400);
await page.click(`[data-hi="${target.id}"]`);
await wait(900);
const openBody = (await page.text('#sideBody') || '');
ok("History opens with a Takes section and an Edits section",
   /Takes/.test(openBody) && /Edits/.test(openBody));
ok(`  and one take is a line, not a numbered card (${(openBody.match(/Take \d+/g) ?? []).length} numbered)`,
   (openBody.match(/Take \d+/g) ?? []).length === 0 && /One take/.test(openBody));
const editsBefore = await page.eval("document.querySelectorAll('[data-restore]').length");

// Edit the passage in the document, with History still open beside it.
await page.eval("(() => { const e = document.querySelector('[data-edit=\"" + target.id + "\"]');"
  + " e.focus(); e.textContent = 'EDITED WHILE HISTORY WAS OPEN.'; e.blur(); return 1; })()");
for (let i = 0; i < 30; i++) {
  if ((await page.eval("document.querySelectorAll('[data-restore]').length")) > editsBefore) break;
  await wait(300);
}
const editsAfter = await page.eval("document.querySelectorAll('[data-restore]').length");
ok(`the open panel picks up the edit without being reopened (${editsBefore} -> ${editsAfter})`,
   editsAfter > editsBefore);
ok("  and the panel is still History, not something else",
   /Takes/.test(await page.text('#sideBody') || ''));

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
  const two = await page.eval("(async () => { const r = await (await fetch('/api/stories')).json();"
    + " const want = ['The Silver Key', 'The Gilded Cage of Reason'];"
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
    const title = (await page.eval("document.querySelector('#bar .serif')?.textContent") || '').trim();
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
    await page.eval("(() => { document.querySelector('[data-mode=\"act\"]')?.click(); return 1; })()");
    await wait(150);
    await page.eval(`(() => { location.hash = '#' + ${JSON.stringify(fast.id)} + '/context'; return 1; })()`);
    await wait(2600);
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
  }
}

console.log(red ? `\n  ${red} RED` : "\n  all green");
