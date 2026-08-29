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
console.log("  ritual running (summarise, remember, extraction, finished)…");
for (let i = 0; i < 180; i++) {
  if (await page.visible('[data-panel="setup"]')) break;
  await wait(1000);
}

// ---- what the screen reports when it is done
ok("the chapter's own screen stays put and hands you on to the next",
   await page.visible('[data-panel="setup"]'));
// THE REPORT SURVIVES A RELOAD. It used to be `V.ritualDone`, a client field carried across
// exactly one refetch and dropped by every other, so the checklist vanished on the next press.
await page.goto(B + "/#" + sid + "/ritual");
for (let i = 0; i < 40 && !(await page.text('#sideBody')); i++) await wait(250);
const again = (await page.text('#sideBody') || '');
ok(`  and the report is still there after a reload (${again.replace(/\s+/g,' ').trim().length} chars)`,
   /summaris/i.test(again));
// THE REPORT ITSELF, and it moved here from the setup panel on 2026-08-28. Setup is what comes
// NEXT; what just ended is the ritual screen's own business, which is the whole reason the screen
// exists. These two assertions came with it unchanged in intent.
console.log("  ritual report: " + again.replace(/\s+/g, ' ').slice(0, 180));
ok("  it reports the summary it wrote", /Summarised in \d+ word|Not summarised/.test(again));
// NOT `|Could not read`, which is what this said until 2026-08-27. The wording it looked for —
// "proposed for the ledger" — was renamed when the ledger became Threads, and the assertion was
// never updated. So for as long as extraction FAILED here it passed on its own failure branch, and
// the day extraction started working on chapter close it went red. An assertion that accepts the
// error message as a pass cannot fail. Same family as the two inert blocks in this file that
// .claude/CLAUDE.md records.
// WHAT THE SCREEN SAYS MUST EQUAL WHAT THE SERVER HOLDS, which is an invariant and holds at zero.
// The version this replaces demanded the model propose at least one fact — a statement about the
// model dressed as a statement about the code, and it goes red on a chapter that genuinely holds
// nothing new. Its ancestor had the opposite fault and accepted "Could not read" as a pass, so it
// could not fail at all. This can fail, and only for a reason worth waking up for: the count on
// screen disagreeing with the queue, or the empty case saying nothing.
const v = await story();
const facts = v.proposals.filter((p) => p.chapterId === closing.id
  && !['state', 'string', 'retire'].includes(p.entryType));
if (facts.length) {
  ok(`  and what extraction proposed is on screen (${facts.length})`,
     new RegExp("Read for facts — " + facts.length + " proposed").test(again));
} else {
  ok("  and a chapter that proposed nothing says so, rather than showing a bare heading",
     /No new threads came out of this chapter/.test(again));
}
// The finished-thread step, in the guard-proof form: the model may legitimately find nothing, so
// assert the invariant that holds at ZERO and then branch with an else, or the check stops running
// and still reports green — which this file has already done twice.
const rets = (await story()).proposals.filter((p) => p.entryType === 'retire');
if (rets.length) {
  ok(`  ${rets.length} finished thread(s) proposed, each decidable in place`,
     /data-decide/.test(again));
} else {
  ok("  nothing was proposed as finished, and the screen says so in words",
     /Nothing was proposed as finished/i.test(again));
}

await page.goto(B + "/#" + sid + "/setup");
for (let i = 0; i < 40 && !(await page.visible('[data-savesetup="1"]')); i++) await wait(250);
ok("the setup panel opens when the ritual finishes", await page.visible('[data-savesetup="1"]'));
const head = (await page.text('#sideHead') || '');
ok(`  and it is titled for the next chapter (${JSON.stringify(head.replace(/\s+/g,' ').trim().slice(0,28))})`,
   /next chapter/i.test(head));
const body = (await page.text('#sideBody') || '');

// The new chapter names itself. It fires from the panel's own render the moment both boxes are
// empty, so by the time the ritual has finished there is something in them — and neither is saved
// until Save is pressed, which is the half that matters and is asserted from the database below.
{
  // A TITLE THAT IS THIS CHAPTER'S OWN NUMBER IS THE PLACEHOLDER, NOT A NAME. `endChapter` opens
  // the next chapter titled `Chapter N` (db.ts), and the panel renders `ch.title` into the box
  // before Anansi has been asked — so "the title box is non-empty" was true from the first paint.
  // This loop broke on it instantly and then read the note box, which Anansi had not filled yet,
  // and reported 0 chars. That is not a model failure and it was reported as one: measured against
  // the route the same evening, the beat came back at 629 characters in this very run, and six
  // direct calls across two databases returned 550 to 906.
  //
  // `7b49bf7` established this exact rule and asserted it in the checks it added; this loop, which
  // predates it, was left reading a placeholder as an answer. `web/app.js:2126` is the same rule in
  // the app: empty, or exactly `Chapter ${index}`.
  const idx = await page.eval("(async () => (await (await fetch('/api/story?story=" + sid + "')).json()).currentChapter.index)()");
  const isPlaceholder = (t) => !String(t ?? '').trim() || String(t).trim() === `Chapter ${idx}`;
  let filled = null;
  for (let i = 0; i < 90; i++) {
    filled = await page.eval("(() => { const t = document.querySelector('[data-setup=\"title\"]');"
      + " const n = document.querySelector('[data-setup=\"note\"]');"
      + " return t && n ? { title: t.value, note: n.value } : null; })()");
    if (filled && (!isPlaceholder(filled.title) || filled.note.trim())) break;
    await wait(1000);
  }
  ok(`Anansi names the new chapter (${JSON.stringify((filled?.title ?? '').slice(0, 30))})`,
     !!filled && !isPlaceholder(filled.title));
  // The other direction, so the check above cannot be satisfied by the thing it exists to refuse.
  ok(`  and \`Chapter ${idx}\` would not have counted as a name`, isPlaceholder(`Chapter ${idx}`)
     && !isPlaceholder('The Stair'));
  ok(`  and says what it has to do (${(filled?.note ?? '').length} chars)`,
     (filled?.note ?? '').trim().length > 60);
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
ok("the beat says it is not set yet", /Not set/.test(body));
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
// The form must survive a repaint. Ticking a character used to rebuild the panel and empty it.
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
ok("  and it leaves you on the document", !/next chapter/i.test(await page.text('#sideHead') || ''));

console.log(red ? `\n  ${red} RED` : "\n  all green");
