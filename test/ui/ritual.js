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
   /summary|summaris/i.test(plan) && /done with|finish/i.test(plan));

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
// The drawer stays open on the hem while the passes run, and asks how the next scene starts; Enter
// sends it, then who is in it, then Done (Seth, 2026-10-30).
ok("closing a scene keeps the hem drawer open and asks what the next scene is",
   await page.visible('#sideBody [data-hemsteer]') && !(await page.visible('[data-savesetup="1"]')));
// THE BRIEF (2026-11-01): the next scene's goal, who is in it and where.
await page.eval("(() => { const t = document.querySelector('#sideBody [data-hemsteer]'); t.value = 'At dawn Aldis takes the key to Marek Vale and tries to give it back.';"
  + " t.dispatchEvent(new Event('input', { bubbles: true }));"
  + " t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return 1; })()");
await wait(800);
ok("  Enter sends it, and who is in the next scene comes next",
   await page.visible('#sideBody [data-hemwhodone]') && !(await page.visible('#sideBody [data-hemsteer]')));
await page.click('#sideBody [data-hemwhodone]');
console.log("  hem running (summary, thread changes, threads, retirements, next scene)…");
let hem = null;
for (let i = 0; i < 240; i++) {
  hem = (await story()).chapters.find((c) => c.id === closing.id)?.hem;
  if (hem?.state === 'done' && 'next' in (hem.passes ?? {})) break;
  await wait(1000);
}
ok(`  and the hem finishes in the background (${hem?.state ?? 'no hem'})`, hem?.state === 'done');
// THE CARDS ARRIVE WITHOUT A RELOAD, on the hem screen itself, where they are decided (2026-10-30):
// the page reads the tale again while a hem runs; give it one read past the finish.
await wait(3500);
const vDone = await story();
const sceneRows = vDone.proposals.filter((p) => p.grp === `scene:${closing.id}`);
const missedNow = Object.values(hem?.passes ?? {}).filter(Boolean).length;
const cardOwed = sceneRows.length > 0 || missedNow > 0 || (hem?.overflow ?? []).length > 0;
if (cardOwed) {
  // One card per thread the hem changed (2026-10-30), and the scene's own card for a pass that did not run.
  ok(`  and its cards are on the hem screen (${sceneRows.length} chalked, ${missedNow} passes did not run)`,
     await page.eval("!!document.querySelector('#sideBody [data-deckall]')"));
} else {
  ok("  and a hem that left nothing to decide has no card", !(await page.eval("!!document.querySelector('#sideBody [data-hemthread], #sideBody [data-deckkind=\"hem\"]')")));
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
     new RegExp(facts.length + " threads? chalked").test(again));
} else {
  ok("  and a chapter that proposed nothing says so, rather than showing a bare heading",
     /No one new/.test(again));
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
// DECIDED ON THE HEM SCREEN, and kept on the Workbench too (Seth, 2026-10-30): the Decide step counts them.
const owed = (await story()).proposals.filter((p) => p.chapterId === closing.id || p.grp === `scene:${closing.id}`).length;
if (owed) {
  ok(`  and the ${owed} proposal(s) are waiting on the Decide step`, /\d+ things? waiting for you/.test(again));
} else {
  ok("  and a scene that proposed nothing has nothing to decide", /Nothing left to decide/.test(again));
}
// The way back when the router was asleep at the close: a failed pass has Try again on its own step,
// and the whole hem can be run again (walkthrough, 2026-10-30: one re-run control, not three).
ok("  and the whole hem can be run again from the report", await page.visible('#sideBody [data-hemagain]:not([data-pass])'));

// DECIDED: every card rejected, so the ledger is as it was (asserted below), and the setup is next.
for (let k = 0; k < 20 && await page.eval("!!document.querySelector('#sideBody [data-deckall=\"reject\"]')"); k++) {
  await page.eval("(() => { document.querySelector('#sideBody [data-deckall=\"reject\"]').click(); return 1; })()"); await wait(900);
}
ok("  and once every card is decided, Set up the next scene is the next press",
   await page.eval("!!document.querySelector('#sideBody [data-setupat=\"more\"]')"));
await page.goto(B + "/#" + sid + "/setup");
// A RELOAD LANDS ON WHAT THE SCENE LEFT while any of it is undecided — the panel's own rule, keyed
// on the rows, not the session. The hem chalks for every thread the scene names since #73, so on
// this fixture there always is some, and the title box is one step on, on the premise step.
for (let i = 0; i < 40 && !(await page.visible('[data-setupstep="premise"]')); i++) await wait(250);
if (!(await page.eval("!!document.querySelector('[data-setup=\"title\"]')"))) await page.eval("(() => { document.querySelector('[data-setupstep=\"premise\"]')?.click(); return 1; })()");
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
    // Every card was decided above, so the scene's card has left the Workbench: the setup by its hash.
    await page.goto(B + "/#" + sid + "/setup");
    for (let i = 0; i < 40 && !(await page.eval("!!document.querySelector('[data-setupstep]')")); i++) await wait(250);
    if (!(await page.visible('[data-setup="title"]'))) await page.eval("(() => { document.querySelector('[data-setupstep=\"premise\"]')?.click(); return 1; })()");
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
  const before = (await story()).chapters.at(-1);
  const said = await page.eval("(async () => { const r = await (await fetch('/api/chapter/propose',"
    + " { method:'POST', headers:{'Content-Type':'application/json'},"
    + " body: JSON.stringify({ storyId: '" + sid + "' }) })).json();"
    + " return JSON.stringify({ n: (r.note ?? '').trim().length, missing: !!r.noteMissing, e: r.error }); })()");
  const got = JSON.parse(said || '{}');
  console.log("  propose says: " + said);
  ok(`  and it reports a missing beat as missing (${got.n} chars, noteMissing ${got.missing})`,
     got.missing === (got.n < 40));
  // PROPOSED. Asking again writes nothing until Start writing, which is what makes it safe to fire unasked.
  // (The hem's own suggestion IS in the scene already, by design since 2026-10-30: `offerScene`.)
  const chNow = (await story()).chapters.at(-1);
  ok("  and asking again writes neither until you press Start writing",
     (chNow?.title ?? '') === (before?.title ?? '') && (chNow?.authorsNote ?? '') === (before?.authorsNote ?? ''));
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

// Who is in it, on Anyone new (Seth, 2026-10-29): each thread a block with how it comes in. One
// control, two mechanisms for ✕ — and which one depends on how the entry already reaches the
// prompt, so the assertion has to branch the same way the app does.
//
// This block used to be guarded by `if (castBtn)` and SILENTLY SKIPPED: the setup page offered
// only triggered entries, the fixture's characters are all always-on, so the selector matched
// nothing and two assertions never ran. The list shows always-on entries, which is what surfaced it.
await page.click('[data-setupstep="more"]');
// A SCENE A HEM OPENED IS ASKED "WHO IS IN IT" ON THE HEM SCREEN, NOT HERE (635e976, Seth 2026-11-01):
// Anyone new says who is in it and offers one press back to that list. This scene came from a hem,
// so assert the sentence and the button, then press back to the editable list. Before this the file
// waited for `[data-howout]` on this step, never saw it, and the ✕/eye block below was skipped
// while the run reported only two reds.
for (let i = 0; i < 20 && !(await page.visible('[data-hemwhoagain]')); i++) await wait(250);
ok("Anyone new says who is in a scene a hem opened, with a press back to the list",
   (await page.visible('[data-whosaid]')) && (await page.visible('[data-hemwhoagain]'))
   && !(await page.visible('[data-howout]')));
await page.click('[data-hemwhoagain]');
for (let i = 0; i < 20 && !(await page.visible('[data-howout]')); i++) await wait(250);
const castBtn = await page.eval("document.querySelector('[data-howout]')?.dataset.howout");
ok("the hem screen's list shows at least one thread in the scene", !!castBtn);
// ONE LINE A THREAD (2026-10-29, option A): a row no taller than a line and its kind, and THE EYE
// (2026-11-01, the Threads list's mark): a tap moves it on, and three taps bring it back round.
{
  const row = JSON.parse(await page.eval(`(() => { const r = document.querySelector('.whorow');
    if (!r) return 'null'; const b = r.getBoundingClientRect(), p = r.querySelector('.whoeye');
    return JSON.stringify({ h: Math.round(b.height), eyes: r.querySelectorAll('.whoeye').length, pills: r.querySelectorAll('.whopill, [data-howin]').length,
      reach: p?.dataset.reach, id: p?.dataset.flipact, pw: Math.round(p?.getBoundingClientRect().height ?? 0) }); })()`));
  ok(`WHO-LINE: a thread is one line with one eye (${JSON.stringify(row)})`, !!row && row.h <= 76 && row.eyes === 1 && row.pills === 0 && row.pw >= 36);
  if (row?.id) {
    const reachOf = () => page.eval(`document.querySelector('.whoeye[data-flipact="${row.id}"]')?.dataset.reach ?? ''`);
    await page.click(`.whoeye[data-flipact="${row.id}"]`);
    for (let i = 0; i < 20; i++) { const l = await reachOf(); if (l && l !== row.reach) break; await wait(250); }
    const after = await reachOf();
    ok(`  a tap on the eye moves it on (${row.reach} -> ${after})`, !!after && after !== row.reach);
    // And back round to where it was (on → on a word → off here → on), so the checks below find the scene as it was.
    for (let k = 0; k < 2; k++) { await page.click(`.whoeye[data-flipact="${row.id}"]`); await wait(900); }
    ok(`  and two more taps bring it back (${await reachOf()})`, (await reachOf()) === row.reach);
  }
}
if (castBtn) {
  const before = await story();
  const ent = before.entries.find((e) => e.id === castBtn);
  const always = ent?.activation === 'always_on';
  console.log(`  taking out ${JSON.stringify(ent?.title)} (${ent?.activation})`);
  await page.click('[data-howout="' + castBtn + '"]');
  await wait(900);
  const v = await story();
  const pin = (v.pins ?? []).find((p) => p.entryId === castBtn && p.chapterId === v.currentChapter.id);
  // An always-on entry is already sent, so the only move is to hold it OUT. A pinned one is unpinned.
  // context.ts applies force_out first, before the always-on branch.
  ok(`✕ writes the right pin (${pin?.mode ?? 'none'})`, always ? pin?.mode === 'force_out' : !pin);
  const reasons = await page.eval("(async () => { const r = await (await fetch('/api/manifest',{method:'POST',"
    + "headers:{'Content-Type':'application/json'},body:JSON.stringify({storyId:'" + sid + "',mode:'continue'})})).json();"
    + " return r.manifest.blocks.filter(b => b.id === '" + castBtn + "').map(b => b.state + ':' + b.reason).join(','); })()");
  ok(`  and the prompt obeys it (${JSON.stringify(reasons)})`, always ? /omitted:pinned out/.test(reasons) : !/pinned in/.test(reasons));
  // Brought back by search, This scene only: pinned in for the scene.
  await page.type('#setupQ', String(ent?.title ?? '').slice(0, 5));
  for (let i = 0; i < 20 && !(await page.visible('[data-howin="' + castBtn + '"][data-how="scene"]')); i++) await wait(250);
  await page.click('[data-howin="' + castBtn + '"][data-how="scene"]');
  await wait(900);
  const v2 = await story();
  ok("  and bringing it back in pins it into the scene",
     (v2.pins ?? []).some((p) => p.entryId === castBtn && p.chapterId === v2.currentChapter.id && p.mode === 'force_in'));
  // Leave it as the fixture had it, so later assertions read a story nobody has quietly changed.
  // Brought in by search it is on a word and pinned in (woken).
  // The eye's cycle (Seth, 2026-11-02) is off -> on a word -> on -> off, and woken counts as on a word,
  // so from a thread brought in by search ("woken") ONE tap lands on "on", the fixture's state, and a
  // second goes on to off, which is off in EVERY scene. The count used to be written as two taps, from
  // the 10-29 cycle. Tap until it reads "on", bounded, so the next change to the cycle shows as a red
  // instead of a quiet overshoot.
  const rch = () => page.eval(`document.querySelector('.whoeye[data-flipact="${castBtn}"]')?.dataset.reach ?? ''`);
  if (always) for (let k = 0; k < 4 && (await rch()) !== 'on'; k++) { await page.click('.whoeye[data-flipact="' + castBtn + '"]'); await wait(900); }
  const v3 = await story();
  ok("  and choosing how it was puts it back",
     v3.entries.find((e) => e.id === castBtn)?.activation === ent?.activation
     && (always ? !(v3.pins ?? []).some((p) => p.entryId === castBtn && p.chapterId === v3.currentChapter.id) : true));
}

// Done on the hem screen's list, then back to the setup page the form lives on.
await page.click('[data-hemwhodone]');
await wait(600);
await page.goto(B + "/#" + sid + "/setup");
for (let i = 0; i < 20 && !(await page.visible('[data-setupstep="premise"]')); i++) await wait(250);
await page.eval("(() => { document.querySelector('[data-setupstep=\"premise\"]')?.click(); return 1; })()");
for (let i = 0; i < 20 && !(await page.visible('[data-setup="note"]')); i++) await wait(250);
await page.eval("(() => { for (const k of ['title','note']) document.querySelector(`[data-setup=\"${k}\"]`).value = ''; return 1; })()");
await page.type('[data-setup="title"]', 'The Stair');
await page.type('[data-setup="note"]', 'It has to end with Aldis handing the key over.');

// ---- saving writes the beat where the engine already reads it
// The form must survive a repaint. Ticking a character used to rebuild the panel and empty it; and
// it must survive the step change back to the beat, which is where its box is.
await page.eval("(() => { document.querySelector('[data-setupstep=\"premise\"]')?.click(); return 1; })()");
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
ok("  and it leaves you on the document", await page.eval("document.getElementById('side').hidden && !/\\/setup/.test(location.hash)"));

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
// A SCENE WITH AN OPENING WAITS FOR THE WRITER'S SEND (Seth, 2026-11-01): the opening is in the box,
// in Direct, and nothing is written for them. With no opening, Anansi opens it with a plain Continue.
const hasOpening = !!String((await story()).currentChapter.opensWith ?? '').trim();
if (hasOpening) {
  const boxNow = JSON.parse(await page.eval("JSON.stringify({ v: document.getElementById('input')?.value, m: document.querySelector('[data-modesel]')?.value })"));
  ok(`  and with an opening it waits in the box as a Direct (${JSON.stringify(boxNow)})`,
     boxNow.v === (await story()).currentChapter.opensWith && boxNow.m === 'direct');
  await page.eval("(() => { document.querySelector('[data-send=\"1\"]').click(); return 1; })()");
}
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
