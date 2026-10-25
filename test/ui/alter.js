// Alter: the caret, Save, Cancel and Esc.
//
//   bash test/ui/run.sh alter
//
// The usability check of 2026-10-24 called Alter dangerous: it opened with the whole passage
// selected, so one keystroke replaced it, and "click away to save" was the only way out. Now the
// caret lands at the end, a bar under the passage has Save and Cancel, and Esc cancels.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (m, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${m}${cond ? "" : "   <-- broken"}`); if (!cond) red++; };

const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find((s) => s.title === 'The Silver Key').id)()");
await page.goto(B + "/#" + sid);
await wait(900);
const pid = await page.eval("document.querySelector('#col .block .narr, #col .block .said')?.dataset.edit");
const body = () => page.eval(`(async () => (await (await fetch('/api/story?story=${sid}')).json()).passages.find((p) => p.id === '${pid}')?.body ?? null)()`);
const start = await body();
ok(`a passage to alter (${pid})`, !!pid && !!start);

const alter = async () => {
  await page.dbl(`[data-edit="${pid}"]`);
  await page.click(`[data-ed="${pid}"]`);
  await wait(300);
};

// ---- the caret, and the bar
await alter();
const opened = await page.eval("(() => ({ focus: document.activeElement?.dataset?.edit ?? null,"
  + " collapsed: getSelection().isCollapsed, save: !!document.querySelector('.altbar [data-altsave]'),"
  + " cancel: !!document.querySelector('.altbar [data-altcancel]') }))()");
ok(`Alter puts the caret in the passage without selecting it all (${JSON.stringify(opened)})`,
   opened.focus === pid && opened.collapsed);
ok("  and shows Save and Cancel under it", opened.save && opened.cancel);

// ---- Cancel keeps the passage as it was
await page.type(`[data-edit="${pid}"]`, " CANCELLED WORDS");
await page.click(`.altbar [data-altcancel]`);
await wait(900);
ok("Cancel saves nothing", (await body()) === start);
ok("  and puts the passage back on screen",
   !(await page.eval(`document.querySelector('[data-edit="${pid}"]').textContent.includes('CANCELLED')`)));
ok("  and takes the bar away", !(await page.eval("!!document.querySelector('.altbar')")));

// ---- Esc cancels too
await alter();
await page.type(`[data-edit="${pid}"]`, " ESCAPED WORDS");
await page.key("Escape", 27);
await wait(900);
ok("Esc cancels", (await body()) === start);

// ---- Save saves
await alter();
await page.type(`[data-edit="${pid}"]`, " SAVED WORDS");
await page.click(`.altbar [data-altsave]`);
await wait(1200);
const after = await body();
ok(`Save saves (${JSON.stringify((after ?? '').slice(-40))})`, (after ?? '').includes('SAVED WORDS'));

// ---- Branch asks twice. One tap in the middle of the sheet used to branch, and the passages after it
// left the page.
const branches = () => page.eval(`(async () => ((await (await fetch('/api/story?story=${sid}')).json()).branches ?? []).length)()`);
const b0 = await branches();
await page.dbl(`[data-edit="${pid}"]`);
await page.click(`.block[aria-expanded="true"] [data-fork="${pid}"]`);
await wait(500);
ok(`one press on Branch makes no branch (${b0} -> ${await branches()})`, (await branches()) === b0);
ok("  and asks for a second press", /Press Branch again/.test((await page.eval("document.getElementById('toast')?.textContent ?? ''"))));
await page.click(`.block[aria-expanded="true"] [data-fork="${pid}"]`);
await wait(900);
ok(`  and the second press makes it (${await branches()})`, (await branches()) === b0 + 1);

console.log(red ? `\n  ${red} RED` : "\n  all green");
