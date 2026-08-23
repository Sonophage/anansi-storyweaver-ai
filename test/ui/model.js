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

// ---- 1. the composer: a take is kept as it arrives
await page.goto(B + "/#" + sid);
const n0 = (await story()).passages.length;
await page.click('[data-mode="fullauto"]');
await page.click('#send');
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

// ---- 5. ending a chapter: closes, opens the next, and summarises the one it closed
const before = await story();
const chBefore = before.chapters.length;
const closing = before.currentChapter;
await page.goto(B + "/#" + sid + "/story");
await page.click('[data-endchapter="1"]');
console.log("  closing the chapter (this summarises)…");
// Poll for the SUMMARY, not the chapter count. endChapter creates the chapter and then awaits
// summarise, so a concurrent read sees the new chapter first and the summary a few seconds later.
for (let i = 0; i < 90; i++) {
  const v = await story();
  if (v.chapters.length > chBefore && v.chapters.find((c) => c.id === closing.id)?.summary) break;
  await wait(1000);
}
const after = await story();
ok(`ending a chapter opens the next (${chBefore} -> ${after.chapters.length})`, after.chapters.length === chBefore + 1);
ok("  and moves you into it", after.currentChapter.id !== closing.id);
const closed = after.chapters.find((c) => c.id === closing.id);
ok(`  and summarises the one it closed (${(closed?.summary ?? '').length} chars)`, !!closed?.summary);
ok("  with a summary that records rather than explains",
   !/\b(indicates|suggests|confirms that|this action|establishes)\b/i.test(closed?.summary ?? ''));

// ---- 5b. Speak puts the line down as yours AND gets an answer, in one press
await page.goto(B + "/#" + sid);
const sBefore = (await story()).passages.length;
await page.click('[data-mode="cowrite"]');
await page.type('#input', '"Then say it plainly," he said.');
await page.click('#send');
console.log("  speaking…");
for (let i = 0; i < 60 && (await story()).passages.length < sBefore + 2; i++) await wait(1000);
const sAfter = (await story()).passages;
ok(`Speak writes your line and gets a reply (${sBefore} -> ${sAfter.length})`, sAfter.length >= sBefore + 2);
ok("  and yours is attributed to you", sAfter.some((p) => p.author === 'human' && /say it plainly/.test(p.body)));
ok("  and the composer is empty again", (await page.eval("document.getElementById('input')?.value")) === '');
ok("  and back to its own height", !(await page.eval("document.getElementById('input')?.style.height")));

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
