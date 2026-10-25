// The keyboard, and the words on What she reads.
//
//   bash test/ui/run.sh keys
//
// From the usability check of 2026-10-24 on the Titan's hardware keyboard: Esc did not close the
// menu or a passage's actions, and Tab walked the menu's hidden controls before reaching anything on
// screen. And What she reads showed the builder's own reasons: anchor, always_on, mode:speak.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (m, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${m}${cond ? "" : "   <-- broken"}`); if (!cond) red++; };

const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find((s) => s.title === 'The Silver Key').id)()");
await page.goto(B + "/#" + sid);
await wait(900);

// ---- Esc shuts a passage's actions
await page.dbl("#col .block .narr, #col .block .said");
await wait(300);
ok("a double click opens a passage's actions", (await page.eval("document.documentElement.dataset.tray")) === '1');
await page.key("Escape", 27);
ok("  and Esc shuts them", (await page.eval("document.documentElement.dataset.tray")) === '0');

// ---- What she reads, in the writer's words
await page.goto(B + "/#" + sid + "/context");
await wait(1200);
const text = await page.eval("document.getElementById('sideBody')?.textContent ?? ''");
const machine = ['always_on', 'anchor', 'mode:', 'retired at chapter', 'pinned out of this chapter', 'tail prose', 'Compact now']
  .filter((w) => text.includes(w));
ok(`What she reads uses no builder words (${JSON.stringify(machine)})`, text.length > 200 && machine.length === 0);

// ---- a phone-sized window with a keyboard: the menu over the page
await page.viewport(390, 844);
await page.goto(B + "/#" + sid);
await wait(900);
ok("the shut menu is out of the tab order", await page.eval("document.getElementById('rail').inert === true"));
ok("  and so is the shut drawer", await page.eval("document.getElementById('side').inert === true"));
await page.click('#bar .pill[data-railview="story"]');
await wait(500);
ok("the ⋯ opens the menu", await page.eval("document.documentElement.dataset.uiRail === 'open' && !document.getElementById('rail').inert"));
await page.key("Escape", 27);
await wait(300);
ok("  and Esc shuts it", await page.eval("document.documentElement.dataset.uiRail === 'closed'"));

// ---- the rack: no second New tale while you are on New tale
await page.goto(B + "/");
await wait(700);
await page.click('#page [data-open="new"], #bar [data-open="new"]');
await wait(700);
ok("on New tale the header offers no second New tale",
   (await page.eval("document.querySelectorAll('#bar [data-open=\"new\"]').length")) === 0);

console.log(red ? `\n  ${red} RED` : "\n  all green");
