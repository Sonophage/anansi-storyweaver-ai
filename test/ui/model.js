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
ok("  and the document shows it", await page.eval("document.getElementById('col').innerHTML.length > 100"));
ok("  and the composer is usable again", await page.eval("!document.getElementById('send').disabled"));

// ---- 2. Regenerate on the bar keeps the old take as a variant
// addVariant selects the NEW take, and passagesOf filters selected = 1 — so after regenerating
// the last row has a different id, and the variants live on that one. Following the id was the
// wrong assertion; following the tail of the document is the right one.
const v0 = ((await story()).passages.at(-1)?.variants ?? []).length;
await page.click('#bar [data-reroll]');
console.log("  regenerating…");
for (let i = 0; i < 60; i++) {
  if (((await story()).passages.at(-1)?.variants ?? []).length > v0) break;
  await wait(1000);
}
const tail = (await story()).passages.at(-1);
ok(`Regenerate keeps both takes (${v0} -> ${(tail?.variants ?? []).length} variants on the tail)`,
   (tail?.variants ?? []).length > v0);
ok("  and the passage count did not grow", (await story()).passages.length === n1);
// Target the tray by the passage's own id: `.block:last-of-type` matched the wrong block,
// because #col holds chapter headings between the blocks.
await page.click('[data-more="' + tail.id + '"]');
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

// ---- 4. editing prose in place saves on blur
const target = (await story()).passages.find((p) => !p.isBreak);
await page.goto(B + "/#" + sid);
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
const idle = async (n = 90) => {
  for (let i = 0; i < n; i++) {
    if (!(await page.eval("document.getElementById('send')?.disabled"))) return true;
    await wait(1000);
  }
  return false;
};
const compose = async (mode, text) => {
  await ready(`[data-mode="${mode}"]`);
  await page.click(`[data-mode="${mode}"]`);
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
  await page.click('[data-mode="direct"]');
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
   libAfter > libBefore || /Accept|Start writing|Title/.test(pageText));
ok("  and the skeleton's fields are shown, not em-dashes", !/—\s*—\s*—/.test(pageText));

// ---- 7. start blank
await page.goto(B + "/");
await page.click('[data-nav="create"]');
const bBefore = (await lib()).length;
await page.click('[data-blank="1"]');
await wait(2500);
ok(`Start blank creates a story (${bBefore} -> ${(await lib()).length})`, (await lib()).length === bBefore + 1);
ok("  and opens it", await page.eval("!!document.getElementById('input')"));

console.log(red ? `\n  ${red} RED` : "\n  all green");
