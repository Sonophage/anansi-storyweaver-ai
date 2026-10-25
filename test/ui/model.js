// The paths that call the model. Slow on purpose — every one of these waits on a real
// generation, so this scenario runs in minutes, not seconds.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/model.js
//
// Point it at a COPY: it writes passages, closes a chapter and creates stories.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (l, g) => { if (!g) red++; console.log("  " + (g ? "ok  " : "RED ") + l); };
const lib = () => page.eval("(async () => (await (await fetch('/api/stories')).json()).stories)()");
const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s=>s.title==='The Silver Key').id)()");
const story = () => page.eval("(async () => await (await fetch('/api/story?story=" + sid + "')).json())()");
// page.goto returns on load; the app then fetches the library, the story and the manifest before
// the dock exists at all. Clicking straight after a goto is a race, and it lost.
const ready = async (sel, n = 40) => {
  for (let i = 0; i < n; i++) { if (await page.visible(sel)) return true; await wait(250); }
  throw new Error(`never appeared: ${sel}`);
};

// ---- 1. the composer: a take is kept as it arrives
// Continue is the mode with no prompt, so it is the one that needs no setup.
await page.goto(B + "/#" + sid);
const n0 = (await story()).passages.length;
await ready('[data-continue="1"]');
await page.click('[data-continue="1"]');
console.log("  generating…");
for (let i = 0; i < 60 && (await story()).passages.length === n0; i++) await wait(1000);
const n1 = (await story()).passages.length;
ok(`the composer appends its take (${n0} -> ${n1})`, n1 === n0 + 1);

// THE VEIL HOLDS THE TAKE UNTIL YOU LEAVE IT (2026-09-02), and it covers everything — so nothing
// below can be looked at, and nothing else can be clicked, until it is dismissed. A `page.click` on
// a button underneath lands on the veil and dismisses it instead of pressing anything, which is
// correct for a writer and is the whole reason this helper exists.
const leaveVeil = async () => {
  if (!(await page.eval("!!document.getElementById('ghost')"))) return;
  await page.eval("(() => { document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); return 1; })()");
  for (let i = 0; i < 40 && (await page.eval("!!document.getElementById('ghost')")); i++) await wait(100);
};
// The server has the passage the moment it writes it; the CLIENT is still typing it out on the
// veil. Waiting on the server count and then asking about the veil is asking too early.
for (let i = 0; i < 120 && !(await page.eval("!!document.querySelector('#ghost.done')")); i++) await wait(250);
ok("  the take is held on the veil rather than dropped on the page",
   await page.eval("!!document.querySelector('#ghost.done')"));
await leaveVeil();
ok("  and the document shows it once the veil goes", await page.eval("document.getElementById('col').innerHTML.length > 100"));
ok("  and the composer is usable again", await page.eval("!document.getElementById('send').disabled"));

// ---- 1b. Stop. The one path where the writer changes their mind mid-generation.
//
// Everything below is asserted against a REAL generation because the two halves that matter —
// the partial vanishing and nothing being written — only exist once tokens are actually arriving.
// test/stream.ts covers the transport with a fake; this covers what the writer sees.
{
  const before = (await story()).passages.length;
  await ready('[data-continue="1"]');
  await page.click('[data-continue="1"]');
  // WAIT FOR THE CALL TO BE IN FLIGHT, not for text to pile up on the page.
  //
  // This used to wait for `#ghost` to hold more than 20 characters, because prose arrived a token
  // at a time and landed there. `062dccd` changed that on purpose — "the roller sits alone in the
  // middle until accept returns and the finished passage fades in once" — so the ghost now holds
  // an animated glyph and never grows. The loop therefore spent its full thirty seconds, the
  // generation FINISHED while it waited, Stop was gone by the time it looked, and the click threw
  // `no element for #send[data-stop]`. Two reds and a death, none of them a product fault.
  //
  // The state to wait on is the one the writer acts against: Send has become Stop, and the roller
  // is up. Both are true from the moment the call goes out and neither depends on how prose is
  // delivered — which is the property that rotted last time and would rot again.
  let arrived = false;
  for (let i = 0; i < 60; i++) {
    if (await page.eval("!!document.getElementById('ghost') && !!document.querySelector('#ghost [data-stop]')")) {
      arrived = true; break;
    }
    await wait(250);
  }
  ok("Stop: the call is in flight, with the roller up, before we stop it", arrived);
  // SEND BECOMES STOP AGAIN, and PLAN-07's note that it does not is now history. PLAN-07 moved Stop
  // to the veil on the argument that the veil "is the only thing you can see while she writes" —
  // true until 2026-09-02, when the veil learned to be dismissed mid-write AND to hide its own Stop
  // once the words start. Between those two there was no way to stop a generation at all. So the
  // composer carries Stop whenever she is writing and no veil is in front of it.
  ok("  the composer carries Stop while she writes", await page.eval(
    "!!document.querySelector('#send[data-stop]')"));
  ok("  and the veil carries one too, until the words start", await page.eval(
    "!!document.querySelector('#ghost [data-stop]')"));
  // STOP IT BEFORE THE FIRST TOKEN, which is the only window on this fixture that is not a race.
  //
  // The old `await wait(2000)` was aiming at "she has produced something", and two seconds here is
  // often the whole generation — so it clicked a Stop that had correctly gone. Waiting for
  // `.written` and then dismissing to reach the composer's Stop has the same problem one step
  // later: the generation can finish during the dismissal and the button goes mid-click.
  //
  // Prefill is ~1.7s on this box, so the veil sits with its own Stop and no words for well over a
  // second. That is a real abort of a call in flight, and it is deterministic.
  //
  // THE MID-WRITE ABORT IS NOT DROPPED — it moved to `test/ui/veil.js` §3d, which leaves the veil
  // once words are on it and presses the composer's Stop. Two scenarios, two windows, neither one
  // pretending to cover the other. This scenario has now rotted three times on how prose is
  // delivered; the fix each time was to wait on a state rather than on a clock.
  ok("  the veil is still formulating, with its own Stop up",
     await page.eval("!!document.querySelector('#ghost:not(.written) [data-stop]')"));
  await page.click('#ghost [data-stop]');
  await wait(2500);
  ok("  the half-written passage is gone", await page.eval("!document.getElementById('ghost')"));
  ok("  nothing was written", (await story()).passages.length === before);
  ok("  and the composer takes a keystroke again", await page.eval(
    "!!document.querySelector('#send[data-send]') && !document.getElementById('input').disabled"));
}

// ---- 2. Regenerate keeps the old take as a variant
// addVariant selects the NEW take, and passagesOf filters selected = 1 — so after regenerating
// the last row has a different id, and the variants live on that one. Following the id was the
// wrong assertion; following the tail of the document is the right one.
const v0 = ((await story()).passages.at(-1)?.variants ?? []).length;
await page.click('#col .carry [data-re]');
console.log("  regenerating…");
for (let i = 0; i < 60; i++) {
  if (((await story()).passages.at(-1)?.variants ?? []).length > v0) break;
  await wait(1000);
}
const tail = (await story()).passages.at(-1);
ok(`Regenerate keeps both takes (${v0} -> ${(tail?.variants ?? []).length} variants on the tail)`,
   (tail?.variants ?? []).length > v0);
ok("  and the passage count did not grow", (await story()).passages.length === n1);
// A re-roll of the last passage puts the veil up too, and it holds until dismissed. Everything
// below reaches for controls on the page, and the veil is in front of all of them — a click aimed
// at one lands on the veil and dismisses it instead, which is right for a writer and useless here.
await leaveVeil();
// Target the tray by the passage's own id: `.block:last-of-type` matched the wrong block,
// because #col holds chapter headings between the blocks.
await page.dbl('[data-edit=\"' + tail.id + '\"]');   // the ⋯ handle is gone; a double tap opens the tray
// Several blocks have steppers; querySelector returns the first, whose tray is shut. Scope it.
const OPEN = '.block[aria-expanded="true"] ';
ok("  and a stepper appears in the tray", await page.visible(OPEN + '[data-vp]'));

// ---- 3. stepping between takes
if (await page.visible(OPEN + '[data-vp]')) {
  const idBefore = (await story()).passages.at(-1)?.id;
  await page.click(OPEN + '[data-vp]');
  await wait(1500);
  const idAfter = (await story()).passages.at(-1)?.id;
  ok(`stepping selects the other take (${idBefore === idAfter ? 'unchanged' : 'changed'})`, idBefore !== idAfter);
} else {
  console.log("  SKIP stepper — no variants to step between");
}

// ---- 3b. History is where the takes belong. Regenerating writes a VARIANT; editing writes a
// REVISION; the panel read revisions only, so a re-rolled passage reported "has not been edited"
// and the takes lived in a hover tray. This is the only place a REAL regeneration reaches it.
// Re-read the tail: stepping in section 3 selected the OTHER take, and passagesOf returns only
// the selected one, so the id captured back in section 2 is no longer on the page. And the
// History button lives in the ⋯ tray, which has to be open before it can be clicked at all.
const cur = (await story()).passages.at(-1);
await page.dbl(`[data-edit=\"${cur.id}\"]`);   // the ⋯ handle is gone; a double tap opens the tray
await wait(400);
await page.click(`[data-hi="${cur.id}"]`);
await wait(1200);
const hist = (await page.text('#sideBody') || '').replace(/\s+/g, ' ');
const takes = (hist.match(/Take \d+/g) ?? []).length;
ok(`History shows the takes, not just the edits (${takes})`, /Version 1/.test(hist) && /Version 2/.test(hist));
ok("  and says which one is in the tale", /in the tale/.test(hist));
ok("  and offers to swap to the other", await page.visible('[data-usetake]'));
// Each take records the canon its own prompt carried. The manifest was already logged per
// generation, with passage_id NULL — nothing tied a take to the prompt behind it.
const against = (hist.match(/Written against/g) ?? []).length;
ok(`  and EACH take records the canon its own prompt carried (${against} of ${takes} takes)`,
   against >= 2);
// The reported case, exactly: regenerate with History ALREADY OPEN. The panel holds its own copy
// fetched when it was opened, and nothing refreshed it — so takes never updated while edits
// appeared to, because you reopen the panel to look at an edit and do not reopen it to
// regenerate. Do not close the panel anywhere in here.
const takesOpen = ((await page.text('#sideBody') || '').match(/Take \d+/g) ?? []).length;
await page.click('#col .carry [data-re]');
console.log("  regenerating with History open…");
// THE PANEL CANNOT PICK ANYTHING UP UNTIL THE VEIL GOES. Since 2026-09-02 the repaint is deferred
// to the dismissal — that is the point of it, so the reading column is not rebuilt while the
// typewriter is drawing — and `#sideBody` is repainted by the same `paint()`. Dismissing is not
// REOPENING, which is the property this section exists to check, so it is still being checked.
for (let i = 0; i < 120 && !(await page.eval("!!document.querySelector('#ghost.done')")); i++) await wait(250);
await leaveVeil();
for (let i = 0; i < 30; i++) {
  if (((await page.text('#sideBody') || '').match(/Take \d+/g) ?? []).length > takesOpen) break;
  await wait(500);
}
const takesNow = ((await page.text('#sideBody') || '').match(/Take \d+/g) ?? []).length;
ok(`the open panel picks up a new take without being reopened (${takesOpen} -> ${takesNow})`,
   takesNow > takesOpen);

// Swapping from History must actually change what is in the document.
const beforeSwap = (await story()).passages.at(-1)?.id;
await page.click('[data-usetake]');
await wait(1500);
ok(`  and swapping from History changes the story (${beforeSwap === (await story()).passages.at(-1)?.id ? 'unchanged' : 'changed'})`,
   (await story()).passages.at(-1)?.id !== beforeSwap);
await page.goto(B + "/#" + sid);
await wait(800);

// ---- 4. editing prose in place saves on blur
const target = (await story()).passages.find((p) => !p.isBreak);
await page.goto(B + "/#" + sid);
// Press EDIT first. Until 2026-08-26 every passage carried `contenteditable` all the time, so
// focusing one and typing was enough; the door was shut that day — a tap in the prose was raising
// the keyboard and starting an edit nobody asked for — and a plain div is not focusable, so
// `focus()` does nothing and `blur()` fires no event and nothing saves.
//
// This scenario is opt-in and needs a live model, so it was not run when that landed and sat
// stale for three days. `handlers.js` was updated the same day and has pressed Edit ever since.
await page.eval("(() => { const blk = document.querySelector('[data-edit=\"" + target.id + "\"]')"
  + ".closest('.block'); blk.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); return 1; })()");
await wait(350);
await page.eval("(() => { const blk = document.querySelector('[data-edit=\"" + target.id + "\"]')"
  + ".closest('.block'); blk.querySelector('button[data-ed]')?.click(); return 1; })()");
await wait(350);
await page.eval("(() => { const e = document.querySelector('[data-edit=\"" + target.id + "\"]');"
  + " e.focus(); e.textContent = 'EDITED BY THE MODEL SCENARIO.'; e.blur(); return 1; })()");
await wait(1200);
const edited = (await story()).passages.find((p) => p.id === target.id);
ok(`editing prose in place saves (${JSON.stringify((edited?.body ?? '').slice(0, 34))})`,
   /EDITED BY THE MODEL SCENARIO/.test(edited?.body ?? ''));

// ---- 5. ending a chapter used to be driven here, against [data-endchapter="1"]. That button
// no longer exists: the end-of-chapter ritual replaced it, and test/ui/ritual.js drives the
// whole ritual — close, summarise, extract, set up the next chapter — rather than just the
// close. This scenario died here for a day without anyone noticing, because it is opt-in and
// the runner scored "8 ok, 0 red" as green. run.sh now requires a scenario to reach its own
// verdict line, which is what surfaced it.

// ---- 5b. What each mode DOES with what you type. This is the distinction the whole set
// exists for, and the bug it replaced: whatever mode you were in, your words only ever became
// a directive, so typed dialogue never reached the page.
// IDLE IS NOT "SEND IS NOT DISABLED" ANY MORE. It was, while `#send` stayed a DISABLED Send for the
// length of a generation. Since 2026-09-02 it is a Stop button while she writes, and a Stop button
// carries no `disabled` — so this returned true on the first tick and every check after it ran on
// top of a live generation. Four reds in §5b, none of them a product fault.
//
// Idle now means what a writer means: nothing is being written, nothing is waiting to be read, and
// the composer is offering Send. The held veil is dismissed on the way, because a take waiting to
// be looked at is the app working, not the app busy.
const idle = async (n = 90) => {
  for (let i = 0; i < n; i++) {
    const st = await page.eval(`(() => {
      const g = document.getElementById('ghost'), b = document.getElementById('send');
      if (g) return g.classList.contains('done') ? 'held' : 'writing';
      return b && b.dataset.send === '1' && !b.disabled ? 'idle' : 'busy'; })()`);
    if (st === 'held') { await leaveVeil(); return true; }
    if (st === 'idle') return true;
    await wait(1000);
  }
  return false;
};
const compose = async (mode, text) => {
  await ready('[data-modesel]');
  await page.mode(mode);
  await page.eval("(() => { document.getElementById('input').value = ''; return 1; })()");
  await page.type('#input', text);
  await page.click('#send');
};

await page.goto(B + "/#" + sid);

// Speak: your line goes down as YOURS, attributed to a named voice, and the model answers it.
{
  const before = (await story()).passages.length;
  await compose('speak', '"Then say it plainly," he said.');
  console.log("  speaking…");
  for (let i = 0; i < 60 && (await story()).passages.length < before + 2; i++) await wait(1000);
  const after = (await story()).passages;
  ok(`Speak writes your line and gets a reply (${before} -> ${after.length})`, after.length >= before + 2);
  const mine = after.find((p) => p.author === 'human' && /say it plainly/.test(p.body));
  ok("  and yours is on the page, attributed to you", !!mine);
  // The `speaker` column means "a named voice", so it is recorded only when there is a name to
  // record: the story's own main character, or whoever you picked in the `as` selector. A story
  // with no persona and no selection writes null, which is honest rather than inventing "you".
  const persona = (await story()).story.persona;
  ok(`  with a named voice, so it renders as speech (${JSON.stringify(mine?.speaker ?? null)}, `
     + `persona ${JSON.stringify(persona ?? null)})`,
     persona ? mine?.speaker === persona : mine?.speaker == null);
  ok("  and the reply is the model's, after yours", after.at(-1)?.author === 'model');
  ok("  and the composer is empty again", (await page.eval("document.getElementById('input')?.value")) === '');
  ok("  and back to its own height", !(await page.eval("document.getElementById('input')?.style.height")));
  await idle();
}

// Act: the same, except an action is narration — so it must NOT be tagged as a spoken line.
{
  const before = (await story()).passages.length;
  await compose('act', 'He sets the brass key on the table between them.');
  console.log("  acting…");
  for (let i = 0; i < 60 && (await story()).passages.length < before + 2; i++) await wait(1000);
  const after = (await story()).passages;
  ok(`Act writes what you did and the world answers (${before} -> ${after.length})`, after.length >= before + 2);
  const mine = after.find((p) => p.author === 'human' && /brass key on the table/.test(p.body));
  ok("  and yours is on the page", !!mine);
  ok("  but NOT as a spoken line — an action is narration", !mine?.speaker);
  await idle();
}

// Narrate: you write the prose. The model continues FROM it rather than about it.
{
  const before = (await story()).passages.length;
  await compose('narrate', 'The rain had stopped. Aldis heard the bell start up over the water, and counted.');
  console.log("  narrating…");
  for (let i = 0; i < 60 && (await story()).passages.length < before + 2; i++) await wait(1000);
  const after = (await story()).passages;
  ok(`Narrate puts your prose down and continues from it (${before} -> ${after.length})`, after.length >= before + 2);
  ok("  and your prose is yours, verbatim",
     after.some((p) => p.author === 'human' && /counted\.$/.test(p.body.trim())));
  ok("  and it is not tagged as speech", !after.find((p) => /counted\.$/.test(p.body.trim()))?.speaker);
  await idle();
}

// Direct: the inverse assertion, and the one that pins the whole distinction. Your text is an
// INSTRUCTION. It must produce prose and must never appear on the page itself.
{
  const before = (await story()).passages;
  const INSTRUCTION = 'Marek refuses the key and walks out into the rain.';
  await compose('direct', INSTRUCTION);
  console.log("  directing…");
  for (let i = 0; i < 60 && (await story()).passages.length === before.length; i++) await wait(1000);
  const after = (await story()).passages;
  ok(`Direct writes prose (${before.length} -> ${after.length})`, after.length > before.length);
  ok("  exactly one passage, not two — an instruction is not a passage",
     after.length === before.length + 1);
  ok("  and your instruction is NOWHERE on the page",
     !after.some((p) => p.body.includes(INSTRUCTION)));
  ok("  the new passage is the model's", after.at(-1)?.author === 'model');
  // It is kept ON the passage, so you can see later what you asked for.
  console.log("  directive recorded on the passage: " + JSON.stringify(after.at(-1)?.directive ?? null));
  await idle();
}

// Continue takes no text at all: pressing it with something typed must not smuggle it in.
{
  const before = (await story()).passages.length;
  await page.mode('direct');
  await page.eval("(() => { document.getElementById('input').value = 'LEAK'; return 1; })()");
  await page.click('[data-continue="1"]');
  console.log("  continuing…");
  for (let i = 0; i < 60 && (await story()).passages.length === before; i++) await wait(1000);
  const after = (await story()).passages;
  ok(`Continue writes with no prompt (${before} -> ${after.length})`, after.length === before + 1);
  ok("  and does not pick up what was left in the box", !after.some((p) => /LEAK/.test(p.body)));
  await idle();
}

// ---- 6. spark: an idea in, a skeleton back, and something to accept
await page.goto(B + "/");
await page.click('[data-nav="create"]');
await page.type('#idea', 'A lighthouse keeper who has been writing letters to a ship that sank forty years ago.');
const libBefore = (await lib()).length;
await page.click('[data-spark="1"]');
console.log("  sparking…");
let sparked = false;
for (let i = 0; i < 60; i++) {
  const txt = await page.text('#page') || '';
  if (/lighthouse|keeper|letters/i.test(txt) && !/A lighthouse keeper who has been/.test(txt.replace(/A lighthouse keeper who has been writing[^]*?ago\./, ''))) { sparked = true; break; }
  if ((await lib()).length > libBefore) { sparked = true; break; }
  await wait(1000);
}
const libAfter = (await lib()).length;
const pageText = (await page.text('#page') || '');
ok(`spark produces something to look at (library ${libBefore} -> ${libAfter})`,
   libAfter > libBefore || /Start writing|Title/.test(pageText));
ok("  and the skeleton's fields are shown, not em-dashes", !/—\s*—\s*—/.test(pageText));

// ---- 7. start blank moved out. It never called the model — it was one click and a count — and
// it now opens a form to fill in rather than creating `Untitled` outright. test/ui/panels.js 13
// drives the whole flow deterministically, so keeping a stale copy here only bought a slow
// scenario one more way to go red for the wrong reason.

console.log(red ? `\n  ${red} RED` : "\n  all green");
