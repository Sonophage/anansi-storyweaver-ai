// The end-of-chapter ritual and the next chapter's setup page. Calls the model twice (summarise
// on close, then extraction), so this is minutes, not seconds.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/ritual.js
//
// Point it at a COPY. It closes a chapter and pins entries.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (l, g) => { if (!g) red++; console.log("  " + (g ? "ok  " : "RED ") + l); };
const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s=>s.title==='The Silver Key').id)()");
const story = () => page.eval("(async () => await (await fetch('/api/story?story=" + sid + "')).json())()");

// The ritual needs prose in the chapter it closes, or there is nothing to summarise.
await page.eval("(async () => { const v = await (await fetch('/api/story?story=" + sid + "')).json();"
  + " for (const body of ['Aldis waited on the stair while the rain went on.',"
  + " 'Marek came up without a lamp and did not explain how he had found the door.']) {"
  + " await fetch('/api/write', { method:'POST', headers:{'Content-Type':'application/json'},"
  + " body: JSON.stringify({ storyId:'" + sid + "', body }) }); } })()");

const before = await story();
const closing = before.currentChapter;
const chBefore = before.chapters.length;

// End this chapter lives on the Chapter panel now, not on Story — the two were one panel until
// the six-panel rearrangement, and closing a chapter is the chapter's business.
await page.goto(B + "/#" + sid + "/chapter");
for (let i = 0; i < 40 && !(await page.visible('[data-ritual="1"]')); i++) await wait(250);
// TWO PRESSES NOW, and that is the point of the change. The button on the Chapter panel is a DOOR
// to the chapter's own screen (PLAN-08 Phase 4, issue #12); the close itself is a second press
// inside it. One press before an act that cannot be undone from one button was one too few.
await page.click('[data-ritual="1"]');
for (let i = 0; i < 40 && !(await page.visible('[data-endchapter="1"]')); i++) await wait(250);
ok("the ritual has a screen of its own, and the close lives on it",
   await page.visible('[data-endchapter="1"]'));
// NAMED BEFORE ANYTHING RUNS. The screen has to say what closing will do while it is still a
// choice, or it is a progress bar with extra steps.
const plan = (await page.text('#sideBody') || '');
ok(`  and it names its steps before anything has run (${plan.replace(/\s+/g,' ').trim().length} chars)`,
   /summarise|summaris/i.test(plan) && /finish/i.test(plan));

await page.click('[data-endchapter="1"]');
// ---- WHERE THE CLOSE LANDS (#92, spec #82 stories 1 and 2). The route answers before the passes
// run, and the writer lands in the new scene at once, blank: not on its setup, and not on a report
// of the scene that just ended. The passes (summary, thread changes, new threads, retirements, the
// next scene's suggestion) run after, and what they find waits on the scene's card on the Workbench.
//
// NOT VERIFIED BY A RUN when #92 rewrote it: this file needs a model and is not in test/ui/run.sh,
// so the assertions below were reasoned from the source. Treat a red here as the test being wrong
// before the app is.
for (let i = 0; i < 40; i++) {
  if ((await story()).currentChapter.id !== closing.id) break;
  await wait(250);
}
await wait(600);
ok("closing a scene lands in the new scene at once, not on its setup",
   !(await page.visible('[data-setupstep]')) && !(await page.visible('[data-savesetup="1"]')));
console.log("  hem running (summary, thread changes, threads, retirements, next scene)…");
let hem = null;
for (let i = 0; i < 180; i++) {
  hem = (await story()).chapters.find((c) => c.id === closing.id)?.hem;
  if (hem?.state === 'done') break;
  await wait(1000);
}
ok(`  and the hem finishes in the background (${hem?.state ?? 'no hem'})`, hem?.state === 'done');
// THE CARD ARRIVES WITHOUT A RELOAD. The page reads the tale again while a hem runs; give it one
// read past the finish, then look at the Workbench by its button, not by a reload.
await wait(3500);
await page.click('[data-panel="waiting"], [data-nav="waiting"]');
await wait(700);
const vDone = await story();
const sceneRows = vDone.proposals.filter((p) => p.grp === `scene:${closing.id}`);
const missedNow = Object.values(hem?.passes ?? {}).filter(Boolean).length;
const cardOwed = sceneRows.length > 0 || missedNow > 0 || !!hem?.suggestion;
if (cardOwed) {
  ok(`  and its one card is on the Workbench (${sceneRows.length} chalked, ${missedNow} passes did not run)`,
     await page.eval("!!document.querySelector('#sideBody [data-deckkind=\"hem\"]')"));
} else {
  ok("  and a hem that left nothing to decide has no card", !(await page.eval("!!document.querySelector('#sideBody [data-deckkind=\"hem\"]')")));
}

// THE REPORT, from the scene's hem, so it is the same after a reload.
await page.goto(B + "/#" + sid + "/ritual");
for (let i = 0; i < 40 && !(await page.text('#sideBody')); i++) await wait(250);
const again = (await page.text('#sideBody') || '');
ok(`  and the report is there after a reload (${again.replace(/\s+/g,' ').trim().length} chars)`,
   /summaris|Your summary|Kept your summary/i.test(again));
console.log("  ritual report: " + again.replace(/\s+/g, ' ').slice(0, 180));
ok("  it reports the summary it wrote", /Summarised in \d+ word|Not summarised|Your summary|Kept your summary/.test(again));
// WHAT THE SCREEN SAYS MUST EQUAL WHAT THE SERVER HOLDS, which is an invariant and holds at zero.
// The version before this demanded the model propose at least one fact — a statement about the
// model dressed as a statement about the code. Its ancestor accepted "Could not read" as a pass, so
// it could not fail at all. This can fail, and only for a reason worth waking up for.
const v = await story();
const facts = v.proposals.filter((p) => p.chapterId === closing.id
  && !['state', 'string', 'retire'].includes(p.entryType));
if (facts.length) {
  ok(`  and what extraction proposed is on screen (${facts.length})`,
     new RegExp("Read for threads — " + facts.length + " chalked").test(again));
} else {
  ok("  and a chapter that proposed nothing says so, rather than showing a bare heading",
     /No new threads came out of this scene/.test(again));
}
// The finished-thread step, in the guard-proof form: assert the invariant that holds at ZERO and
// branch with an else, or the check stops running and still reports green.
const rets = (await story()).proposals.filter((p) => p.entryType === 'retire' && p.chapterId === closing.id);
if (rets.length) {
  ok(`  ${rets.length} finished thread(s) proposed, and the count is on screen`,
     new RegExp(`${rets.length} thread${rets.length === 1 ? '' : 's'} chalked to be retired`).test(again));
} else {
  ok("  nothing was proposed as finished, and the screen says so in words",
     /No thread was chalked to be retired/i.test(again));
}
// COUNCIL 07, SEAT 4: the count stays here, the deciding is on the Workbench.
const owed = (await story()).proposals.filter((p) => p.chapterId === closing.id).length;
if (owed) {
  ok(`  and the ${owed} proposal(s) are decided on the Workbench rather than a second time here`,
     (await page.visible('[data-panel="waiting"]')) && new RegExp(`Decide the ${owed} chalked thing`).test(again));
} else {
  ok("  and a chapter that proposed nothing offers no queue to decide",
     !(await page.visible('[data-panel="waiting"]')));
}
// The way back when the router was asleep at the close: one Try again for each of the five passes.
// #92: a scene hemmed in the background runs each pass again through its hem.
ok("  and every pass can be run again from the report", await page.visible('[data-hemagain][data-pass="summary"]')
   && await page.visible('[data-hemagain][data-pass="memory"]') && await page.visible('[data-hemagain][data-pass="facts"]')
   && await page.visible('[data-hemagain][data-pass="finished"]') && await page.visible('[data-hemagain][data-pass="next"]'));

await page.goto(B + "/#" + sid + "/setup");
// A RELOAD LANDS ON WHAT THE SCENE LEFT while any of it is undecided — the panel's own rule, keyed
// on the rows, not the session. The hem chalks for every thread the scene names since #73, so on
// this fixture there always is some, and the title box is one step on, on the premise step.
for (let i = 0; i < 40 && !(await page.visible('[data-setupstep="premise"]')); i++) await wait(250);
if (!(await page.visible('[data-savesetup="1"]'))) await page.click('[data-setupstep="premise"]');
for (let i = 0; i < 40 && !(await page.visible('[data-savesetup="1"]')); i++) await wait(250);
ok("the setup panel is reachable on its own hash too", await page.visible('[data-savesetup="1"]'));
const head = (await page.text('#sideHead') || '');
ok(`  and it is titled for the next chapter (${JSON.stringify(head.replace(/\s+/g,' ').trim().slice(0,28))})`,
   /next scene/i.test(head));
const body = (await page.text('#sideBody') || '');

// THE NEW SCENE'S SETUP SHOWS THE HEM'S SUGGESTION (#92, Seth 2026-10-29). Nothing asks Anansi to
// name it as the panel opens: the hem's last pass suggests a title, a note and an opening, and The
// next scene shows them in its boxes, reached from the scene's card by Set up the next scene. With
// no suggestion it opens blank. Nothing is saved until Save, which is asserted from the database below.
{
  // A TITLE THAT IS THIS CHAPTER'S OWN NUMBER IS THE PLACEHOLDER, NOT A NAME. `endChapter` opens
  // the next chapter titled `Scene N` (db.ts), and the panel renders it into the box. The app's own
  // rule is `numbered` (web/model.js): empty, or exactly `Chapter N` / `Scene N`.
  const idx = await page.eval("(async () => (await (await fetch('/api/story?story=" + sid + "')).json()).currentChapter.index)()");
  const isPlaceholder = (t) => !String(t ?? '').trim() || [`Chapter ${idx}`, `Scene ${idx}`].includes(String(t).trim());
  const boxes = () => page.eval("(() => { const t = document.querySelector('[data-setup=\"title\"]');"
    + " const n = document.querySelector('[data-setup=\"note\"]');"
    + " return t && n ? { title: t.value, note: n.value } : null; })()");
  // The other direction, so the checks below cannot be satisfied by the thing they exist to refuse.
  ok(`\`Scene ${idx}\` would not count as a name`, isPlaceholder(`Scene ${idx}`)
     && !isPlaceholder('The Stair'));
  let filled = await boxes();
  if (hem?.suggestion) {
    // The card may not be the top one on the deck, and only the top one shows, so the press is
    // made on the button itself.
    await page.goto(B + "/#" + sid + "/waiting");
    for (let i = 0; i < 40 && !(await page.eval("!!document.querySelector('[data-hemsetup]')")); i++) await wait(250);
    await page.eval("(() => { document.querySelector('[data-hemsetup]')?.click(); return 1; })()");
    for (let i = 0; i < 20 && !(await page.visible('[data-setup="title"]')); i++) await wait(250);
    filled = await boxes();
    ok(`Set up the next scene shows it named (${JSON.stringify((filled?.title ?? '').slice(0, 30))})`,
       !!filled && !isPlaceholder(filled.title));
    ok(`  and says what it has to do (${(filled?.note ?? '').length} chars)`,
       (filled?.note ?? '').trim().length > 60);
  } else {
    // The suggestion is the hem's last pass; with the model down it did not come back, and the
    // report has to say so rather than leave the card silent.
    ok(`  no suggestion came back, and the hem says why (${JSON.stringify(hem?.passes?.next ?? null)})`,
       typeof hem?.passes?.next === 'string');
    ok(`  and the new scene opens blank (${JSON.stringify(filled?.title ?? null)})`,
       !!filled && isPlaceholder(filled.title) && !filled.note.trim());
  }
  // On 2026-08-28 this came back 0 chars: CHAPTER_SCHEMA marks `note` required, and `required`
  // means the key is PRESENT, not that it holds anything, so an empty string satisfied the
  // grammar completely. The route asks a second time now. If the model still says nothing, the
  // red above is the honest answer — but the app must not then claim she suggested a beat, and
  // that is what this asserts. It only runs on the failing path, so it is written as an
  // if/else rather than a bare `if`: a check that quietly stops running is this repo's oldest
  // recurring bug.
  //
  // Asserted against the ROUTE rather than the toast. A toast is gone in seconds and the loop
  // above can spend a minute waiting, so reading `#toast` here tested the clock. The route's
  // answer is the contract, and the invariant holds whatever the model says on the day: it
  // reports `noteMissing` exactly when the beat it returned is too short to steer anything.
  const said = await page.eval("(async () => { const r = await (await fetch('/api/chapter/propose',"
    + " { method:'POST', headers:{'Content-Type':'application/json'},"
    + " body: JSON.stringify({ storyId: '" + sid + "' }) })).json();"
    + " return JSON.stringify({ n: (r.note ?? '').trim().length, missing: !!r.noteMissing, e: r.error }); })()");
  const got = JSON.parse(said || '{}');
  console.log("  propose says: " + said);
  ok(`  and it reports a missing beat as missing (${got.n} chars, noteMissing ${got.missing})`,
     got.missing === (got.n < 40));
  // PROPOSED. Nothing is written until Save, which is what makes it safe to fire unasked.
  const chNow = (await story()).chapters.at(-1);
  ok("  and writes neither until you press Save",
     (chNow?.title ?? '') !== filled.title.trim() || !chNow?.authorsNote);
}

const after = await story();
ok(`the chapter closed and the next opened (${chBefore} -> ${after.chapters.length})`, after.chapters.length === chBefore + 1);
ok("  you are in the new one", after.currentChapter.id !== closing.id);
const closed = after.chapters.find((c) => c.id === closing.id);
ok(`  and the one you left is summarised (${(closed?.summary ?? '').length} chars)`, !!closed?.summary);
ok("  nothing was accepted into the ledger automatically",
   after.entries.length === before.entries.length);

// ---- the setup page's three fields, all writing to things that already exist
// With the hem's suggestion the boxes hold it, so only a scene with none says it is not set.
if (hem?.suggestion?.note) ok("the beat holds the hem's suggestion, so it says it is read", /Anansi reads it every time he writes, as where/.test(body));
else ok("the beat says it is not set yet", /Not set/.test(body));
// Typed with real keystrokes, not by assigning .value: the panel keeps the form in state via the
// input event, and a programmatic assignment fires no event — which is the test's problem, not the
// app's, but it looked identical to the bug for one run.
await page.eval("(() => { for (const k of ['title','note']) document.querySelector(`[data-setup=\"${k}\"]`).value = ''; return 1; })()");
await page.type('[data-setup="title"]', 'The Stair');
await page.type('[data-setup="note"]', 'It has to end with Aldis handing the key over.');

// Who is in it. One control, two mechanisms — and which one depends on how the entry already
// reaches the prompt, so the assertion has to branch the same way the app does.
//
// This block used to be guarded by `if (castBtn)` and SILENTLY SKIPPED: the setup page offered
// only triggered entries, the fixture's characters are all always-on, so the selector matched
// nothing and two assertions never ran. Always-on entries are offered now, which is what
// surfaced it.
// WHO IS IN IT IS THE THIRD STEP, Anyone new, one press on from the beat (760b857 split the page).
await page.click('[data-setupstep="more"]');
for (let i = 0; i < 20 && !(await page.visible('[data-pin]')); i++) await wait(250);
const castBtn = await page.eval("document.querySelector('[data-pin]')?.dataset.pin");
ok("the setup page offers at least one character to tick", !!castBtn);
if (castBtn) {
  const before = await story();
  const ent = before.entries.find((e) => e.id === castBtn);
  const always = ent?.activation === 'always_on';
  console.log(`  ticking ${JSON.stringify(ent?.title)} (${ent?.activation})`);
  await page.click('[data-pin="' + castBtn + '"]');
  await wait(900);
  const v = await story();
  const pin = (v.pins ?? []).find((p) => p.entryId === castBtn && p.chapterId === v.currentChapter.id);
  // An always-on entry is already sent, so the only move is to hold it OUT. A triggered one is
  // pushed IN. context.ts applies force_out first, before the always-on branch, so both land.
  ok(`ticking a character writes the right kind of pin (${pin?.mode})`,
     pin?.mode === (always ? 'force_out' : 'force_in'));
  const reasons = await page.eval("(async () => { const r = await (await fetch('/api/manifest',{method:'POST',"
    + "headers:{'Content-Type':'application/json'},body:JSON.stringify({storyId:'" + sid + "',mode:'continue'})})).json();"
    + " return r.manifest.blocks.filter(b => b.id === '" + castBtn + "').map(b => b.state + ':' + b.reason).join(','); })()");
  ok(`  and the prompt obeys it (${JSON.stringify(reasons)})`,
     always ? /omitted:pinned out/.test(reasons) : /included:pinned in/.test(reasons));
  await page.click('[data-pin="' + castBtn + '"]');
  await wait(900);
  const v2 = await story();
  ok("  and clicking again clears it", !(v2.pins ?? []).some((p) => p.entryId === castBtn && p.chapterId === v2.currentChapter.id));
  // Leave it as the fixture had it, so later assertions read a story nobody has quietly changed.
  if (!always) { await page.click('[data-pin="' + castBtn + '"]'); await wait(700); }
}

// where -> the same mechanism on a lore entry
const placeBtn = await page.eval("document.querySelector('[data-place]')?.dataset.place");
if (placeBtn) {
  await page.click('[data-place="' + placeBtn + '"]');
  await wait(900);
  const v = await story();
  ok("pinning a place uses the same mechanism",
     (v.pins ?? []).some((p) => p.entryId === placeBtn && p.mode === 'force_in'));
}

// ---- saving writes the beat where the engine already reads it
// The form must survive a repaint. Ticking a character used to rebuild the panel and empty it; and
// it must survive the step change back to the beat, which is where its box is.
await page.click('[data-setupstep="premise"]');
for (let i = 0; i < 20 && !(await page.visible('[data-setup="note"]')); i++) await wait(250);
ok("what was typed survived ticking a character",
   (await page.eval("document.querySelector('[data-setup=\"note\"]')?.value")) === 'It has to end with Aldis handing the key over.');
await page.click('[data-savesetup="1"]');
await wait(1200);
const saved = (await story()).currentChapter;
ok(`saving writes the title (${JSON.stringify(saved.title ?? '')})`, saved.title === 'The Stair');
ok("  and the beat", /handing the key over/.test(saved.authorsNote ?? ''));
ok("  and the beat reaches DIRECTIVE",
   /handing the key over/.test(await page.eval("(async () => { const r = await (await fetch('/api/manifest',{method:'POST',"
     + "headers:{'Content-Type':'application/json'},body:JSON.stringify({storyId:'" + sid + "',mode:'direct'})})).json();"
     + " return r.prompt; })()")));
ok("  and it leaves you on the document", !/next scene/i.test(await page.text('#sideHead') || ''));

// ---- ANANSI OPENS THE NEW CHAPTER, which she had stopped doing after the first one.
// `openingPassage` guarded on whether the BOOK held prose rather than whether this CHAPTER did —
// `db.passagesOf` returns the whole branch — so on every book past its first passage it returned
// early and the setting silently did nothing. It also fired from the CLOSE, which put the one
// passage that could not carry the chapter's beat at the front of every chapter. It fires from
// Save now, after the beat exists.
//
// Asserted with the fixture's own setting checked FIRST rather than guarded on it: a book with
// auto-open switched off would make the assertion below meaningless, and a bare `if` around it
// would let it stop running and still report green — which this file has already done twice.
const opensItself = (await story()).story.autoOpen !== false;
ok("the fixture opens its own chapters, so the next check means something", opensItself);
let opened = [];
for (let i = 0; i < 150; i++) {
  const v2 = await story();
  opened = (v2.passages ?? []).filter((p) => p.chapterId === v2.currentChapter.id && !p.isBreak);
  if (opened.length) break;
  await wait(1000);
}
ok(`  and Anansi writes the new chapter's opening passage (${opened.length} in the new chapter)`,
   opened.length > 0);
// The half the reorder was for: it is written AFTER the beat, so the beat is in the prompt that
// wrote it. The beat was saved above and the passage came after, so the chapter it belongs to
// carries both.
const openedIn = (await story()).currentChapter;
ok("  and the chapter it opened carries the beat that steers it",
   /handing the key over/.test(openedIn.authorsNote ?? ''));

console.log(red ? `\n  ${red} RED` : "\n  all green");
