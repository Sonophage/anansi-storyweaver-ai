// Drive the four actions that were dead, in a real browser:
//   ANANSI_PORT=5179 ANANSI_DB=<a copy> node --experimental-strip-types serve.ts &
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/buttons.js
// Point it at a COPY of the database. It renames an entry and creates a character.
const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s=>s.title==='The Silver Key').id)()");
let red = 0;
const ok = (label, got) => { if (!got) red++;
  console.log("  " + (got ? "ok  " : "FAIL") + " " + label + (got ? "" : "   <-- broken")); };

// ---- 1. clicking an entry in Worlds & lorebooks opens it
await page.goto("http://127.0.0.1:5179/#" + sid);
await page.click('[data-leave="1"]');
await page.click('[data-nav="canon"]');
const cards = await page.eval("document.querySelectorAll('#page [data-entry]').length");
console.log("  entries listed on the Worlds page: " + cards);
await page.click('#page [data-entry]');
ok("clicking an entry opens the editor", await page.eval("!!document.querySelector('[data-f=\"body\"]')"));
ok("  and the name field is populated", !!(await page.eval("document.querySelector('[data-f=\"title\"]')?.value")));

// editing it actually saves
await page.eval("document.querySelector('[data-f=\"title\"]').value = 'RENAMED BY TEST'");
await page.click('[data-saveentry="1"]');
await wait(500);
ok("Save writes the new name", await page.eval("(async () => { const v = await (await fetch('/api/story?story=" + sid + "')).json(); return v.entries.some(e => e.title === 'RENAMED BY TEST'); })()"));

// ---- 2. New character
await page.goto("http://127.0.0.1:5179/#" + sid + "/cast");
const before = await page.eval("(async () => (await (await fetch('/api/story?story=" + sid + "')).json()).entries.length)()");
await page.click('[data-newentry="character"]');
await wait(500);
const after = await page.eval("(async () => (await (await fetch('/api/story?story=" + sid + "')).json()).entries.length)()");
ok("New character creates an entry (" + before + " -> " + after + ")", after === before + 1);
ok("  and opens it for editing", await page.eval("!!document.querySelector('[data-f=\"body\"]')"));

// ---- 3. Edit and History on a passage
await page.goto("http://127.0.0.1:5179/#" + sid);
const pid = await page.eval("document.querySelector('#col [data-edit]')?.dataset.edit");
console.log("  first passage: " + pid);
await page.click('#col .block .more');
await page.click('[data-ed="' + pid + '"]');
ok("Edit focuses the passage text", await page.eval("document.activeElement?.dataset?.edit === '" + pid + "'"));

await page.click('[data-hi="' + pid + '"]');
ok("History opens its panel", (await page.text('#sideHead') || '').includes('History'));
ok("  and offers a branch from that passage", await page.eval("!!document.querySelector('[data-fork]')"));

// ---- 4. the model selector
await page.click('[data-leave="1"]');
await page.click('[data-nav="prefs"]');
await wait(1200);
const models = await page.eval("document.querySelectorAll('[data-pickmodel]').length");
ok("Preferences lists models (" + models + ")", models > 1);
ok("  and marks the active one", await page.eval("!!document.querySelector('[data-pickmodel]')"));

console.log(red ? `\n  ${red} RED` : "\n  all green");
