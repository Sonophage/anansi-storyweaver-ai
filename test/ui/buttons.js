// Drive the four actions that were dead, in a real browser:
//   ANANSI_PORT=5179 ANANSI_DB=<a copy> node --experimental-strip-types serve.ts &
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/buttons.js
// Point it at a COPY of the database. It renames an entry and creates a character.
const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s=>s.title==='The Silver Key').id)()");
let red = 0;
const ok = (label, got) => { if (!got) red++;
  console.log("  " + (got ? "ok  " : "FAIL") + " " + label + (got ? "" : "   <-- broken")); };

// ---- 1. clicking an entry in the workspace Threads page opens it
await page.goto("http://127.0.0.1:5179/#" + sid);
// "Anansi's web" was removed from the story menu on 2026-08-27 — the menu button in the bar is
// the one door to the workspace now, from anywhere.
// Seth took the word Anansi out of the header on 2026-08-29, so INSIDE A STORY the main menu is
// two taps: the story's name opens the story menu, and the Anansi word at the top of that menu
// opens the main one. Outside a story the header name still does it in one.
await page.click('#bar [data-railview="story"], #bar [data-railview="workspace"]');
await wait(400);
await page.click('#rail [data-home]');
await wait(400);
await page.click('[data-nav="canon"]');
const cards = await page.eval("document.querySelectorAll('#page [data-entry]').length");
console.log("  entries listed on the Worlds page: " + cards);
await page.click('#page [data-entry]');
// A CARD OPENS ON ITS FACE, not its form — that is the whole point of the face, so that pressing a
// thread to READ it does not land you in a page of empty boxes. This asserted the form directly
// and had been dying on it since; `panels.js` and `phone.js` learned to press Edit and this file
// was missed. Both halves are asserted now, so neither can quietly become the other.
ok("clicking an entry opens its face", await page.eval("!!document.querySelector('[data-cardview=\"form\"]')"));
await page.click('[data-cardview="form"]');
await wait(300);
ok("  and Edit opens the form", await page.eval("!!document.querySelector('[data-f=\"body\"]')"));
ok("  with the name field populated", !!(await page.eval("document.querySelector('[data-f=\"title\"]')?.value")));

// editing it actually saves
await page.eval("document.querySelector('[data-f=\"title\"]').value = 'RENAMED BY TEST'");
await page.click('[data-saveentry="1"]');
await wait(500);
ok("Save writes the new name", await page.eval("(async () => { const v = await (await fetch('/api/story?story=" + sid + "')).json(); return v.entries.some(e => e.title === 'RENAMED BY TEST'); })()"));

// ---- 2. New character
await page.goto("http://127.0.0.1:5179/#" + sid + "/threads");
const before = await page.eval("(async () => (await (await fetch('/api/story?story=" + sid + "')).json()).entries.length)()");
// THROUGH THE TRAY, which is the only door since 2026-09-02 — Seth: "the buttons can all go away
// and we can just keep the add thread since all the information for adding something and what type
// is there. just make sure that any functionality that these buttons may have carry over."
// This is that carry-over, driven: open the one door, pick the kind, press New character. The same
// data-newentry the four buttons carried is what the tray presses at the end of it.
// SCOPED TO #sideBody: the composer's threads dial has a data-newlore OPTION, and an option has no
// box for the driver to press.
await page.click('#sideBody [data-newlore]');
await wait(400);
await page.click('[data-lorekind="character"]');
await wait(400);
await page.click('[data-newentry="character"]');
await wait(500);
const after = await page.eval("(async () => (await (await fetch('/api/story?story=" + sid + "')).json()).entries.length)()");
ok("New character creates an entry (" + before + " -> " + after + ")", after === before + 1);
ok("  and opens it for editing", await page.eval("!!document.querySelector('[data-f=\"body\"]')"));

// ---- 3. Edit and History on a passage
await page.goto("http://127.0.0.1:5179/#" + sid);
const pid = await page.eval("document.querySelector('#col [data-edit]')?.dataset.edit");
console.log("  first passage: " + pid);

// ---- 3a. the backdrop belongs to the tray while a tray is up
// #scrim serves the rail as well, and this is the desk, where the rail is on screen and has no
// backdrop of its own. Shutting the RAIL instead looks like it works — the repaint that closes it
// rebuilds the column and takes the tray with it — and costs the writer their navigation for
// dismissing a menu. Asserted here rather than on the phone, where the two cannot both be open.
const railWas = await page.eval("document.documentElement.dataset.uiRail");
// The ⋯ handle was removed on 2026-08-27 — a double tap opens the tray and has since F34's fix,
// so the dot row was a second door to the same room, sitting over the prose on every passage.
await page.dbl('#col .block .narr, #col .block .said');
await wait(300);
ok("a double tap raises the backdrop", (await page.eval("document.documentElement.dataset.tray")) === '1');
// #bar's centre is over the backdrop and nowhere near the sheet, which is in the middle of the screen.
await page.click('#bar');
ok("  and a click on the backdrop shuts the tray",
   (await page.eval("document.documentElement.dataset.tray")) === '0');
ok(`  and leaves the rail as it was (${railWas})`,
   (await page.eval("document.documentElement.dataset.uiRail")) === railWas);

await page.dbl('#col .block .narr, #col .block .said');   // the ⋯ handle is gone; double tap opens the tray
await page.click('[data-ed="' + pid + '"]');
ok("Edit focuses the passage text", await page.eval("document.activeElement?.dataset?.edit === '" + pid + "'"));

// The tray is a centred sheet over the content now, so Edit shuts it on its way to the cursor —
// leaving it up would hide the paragraph it just put the caret in. So it is reopened for History.
await page.dbl('#col .block .narr, #col .block .said');   // the ⋯ handle is gone; double tap opens the tray
await page.click('[data-hi="' + pid + '"]');
ok("History opens its panel", (await page.text('#sideHead') || '').includes('History'));
ok("  and offers a branch from that passage", await page.eval("!!document.querySelector('[data-fork]')"));

// ---- 3b. Delete asks first, and does not take the other takes with it
// It sits next to Regenerate in the same tray and used to fire on one press, with no undo.
const blocksBefore = await page.eval("document.querySelectorAll('#col [data-edit]').length");
await page.dbl('#col .block .narr, #col .block .said');   // the ⋯ handle is gone; double tap opens the tray
await page.click('[data-del="' + pid + '"]');
await wait(300);
ok("Delete does not delete on the first press",
   (await page.eval("document.querySelectorAll('#col [data-edit]').length")) === blocksBefore);
ok("  and says so where the tray is text", (await page.text('#toast') || '').includes('Press Delete again'));
// The tray is still open — confirming through paint() would have closed it on a phone, where
// the labels are hidden and the toast is the only thing that says a second press is wanted.
// eval, not page.click: with the confirmation gone the first press already deleted the passage and
// a missing element kills the scenario, which reports as a death rather than as this assertion.
await page.eval("(() => { document.querySelector('[data-del=\"" + pid + "\"]')?.click(); return 1; })()");
await wait(500);
ok("  and deletes on the second (" + blocksBefore + " -> "
   + (await page.eval("document.querySelectorAll('#col [data-edit]').length")) + ")",
   (await page.eval("document.querySelectorAll('#col [data-edit]').length")) === blocksBefore - 1);

// ---- 4. the model selector
// "Anansi's web" was removed from the story menu on 2026-08-27 — the menu button in the bar is
// the one door to the workspace now, from anywhere.
// Seth took the word Anansi out of the header on 2026-08-29, so INSIDE A STORY the main menu is
// two taps: the story's name opens the story menu, and the Anansi word at the top of that menu
// opens the main one. Outside a story the header name still does it in one.
await page.click('#bar [data-railview="story"], #bar [data-railview="workspace"]');
await wait(400);
await page.click('#rail [data-home]');
await wait(400);
await page.click('[data-nav="prefs"]');
await wait(1200);
// #23 took the model list OFF this page — the rail footer has the one that stays, and what is left
// is a writing record. All three asserted, because "the list is gone" on its own would also pass on
// a page that failed to render at all, which is the failure this change could plausibly have caused.
const models = await page.eval("document.querySelectorAll('#page [data-pickmodel]').length");
ok("the writing record lists no models (" + models + ")", models === 0);
// The rail's list is behind its own press — `data-modelmenu` opens it — so the door is what to
// assert, not a list that is not on screen until you ask for it.
const railDoor = await page.eval("!!document.querySelector('#rail [data-modelmenu]')");
ok("  and the rail footer still has the door to one", railDoor);
ok("  and the page rendered — it is the record, not an empty panel",
   /What you have written/.test(await page.text('#page') || ''));

console.log(red ? `\n  ${red} RED` : "\n  all green");
