// The doors a new writer can see: the menu, the way back to the library, and a passage's actions.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/doors.js
//
// The usability check of 2026-10-24 found the menu reachable only through the header title and a
// passage's actions only through a double tap, with nothing on screen saying either. Seth chose the
// R1 design on 2026-10-25: a menu button in the library, a ‹ back pill and a ⋯ in a tale, and one tap
// on a passage for its actions. Asserted on a phone, by touch, and then on a Titan's square.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (m, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${m}${cond ? "" : "   <-- broken"}`); if (!cond) red++; };
// #71. Once a passage has landed the composer is folded behind the three buttons; the quill in
// the middle opens it, which is what a writer does before typing their own line.
const openDock = async () => {
  for (let i = 0; i < 40 && !(await page.eval("!!document.getElementById('dock')")); i++) await wait(100);
  if (await page.eval("!!document.getElementById('dock')?.classList.contains('folded')")) await page.click('#quill');
};

await page.mobile();
await page.goto(B + "/");
await wait(900);

const seen = (sel) => page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)});
  if (!e) return null; const r = e.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.right <= innerWidth + 1 && r.left >= -1
    ? e.textContent.replace(/\\s+/g, ' ').trim() : null; })()`);
const railOpen = () => page.eval("document.documentElement.dataset.uiRail === 'open'");
// The backdrop's own listener, pressed directly. page.click presses the CENTRE of an element, and
// the centre of the scrim is the middle of the sheet that sits on it — that pressed a button.
const backdrop = () => page.eval("(() => { document.getElementById('scrim').click(); return 1; })()");
const tray = () => page.eval("!!document.querySelector('.block[aria-expanded=\"true\"]')");

// ---- the library
// The ☰ alone since 2026-10-25 (Seth: "Remove the word menu, keep it as a menu"); its name is
// for a screen reader.
const menu = await seen('#bar .hdoor[data-railview="workspace"]');
ok(`the library shows the menu button, ☰ with no word (${JSON.stringify(menu)})`, menu === '☰'
   && (await page.eval("document.querySelector('#bar .hdoor[data-railview=\"workspace\"]').getAttribute('aria-label')")) === 'Menu');
await page.click('#bar .hdoor[data-railview="workspace"]');
await wait(500);
ok("  and pressing it opens the menu", await railOpen());
await page.goto(B + "/");
await wait(600);

// ---- every menu page's header fits a phone. The second review (2026-10-25) measured the bar at
// 446px on a 390px screen on every page but the library: Carry on writing pushed the titles to "Threa…".
// Import, Export and What you have written have no menu row since 2026-10-27: their doors are in
// Account → Your books, so the walk opens that tab before each of them.
const over = [], heads = new Set();
const press = (sel) => page.eval(`(() => { document.querySelector(${JSON.stringify(sel)}).click(); return 1; })()`);
for (const nav of ['canon', 'account', 'prefs', 'forge', 'create', 'import', 'news', 'bug']) {
  if (['prefs', 'forge', 'import'].includes(nav)) {
    await press('[data-nav="account"]'); await wait(500);
    await press('[data-accttab="books"]'); await wait(300);
  }
  await press(`[data-nav="${nav}"]`);
  await wait(500);
  const o = await page.eval("(() => { const b = document.getElementById('bar'); return b.scrollWidth - b.clientWidth; })()");
  if (o > 0) over.push(`${nav} +${o}px`);
  heads.add(await page.eval("document.getElementById('bar').textContent.replace(/\\s+/g, ' ').trim()"));
}
ok(`every menu page's header fits on a phone (${JSON.stringify(over)})`, over.length === 0);
// Eight different headers, or a press missed and the same page was measured twice.
ok(`  and it measured eight different pages (${heads.size})`, heads.size === 8);

// ---- Start blank reads the threads it offers. It said "Reading your threads…" for ever.
await page.eval("(() => { document.querySelector('[data-nav=\"create\"]').click(); return 1; })()");
await wait(500);
await page.eval("(() => { document.querySelector('[data-blank]').click(); return 1; })()");
await wait(2000);
ok("Start blank does not wait for ever on the threads",
   !(await page.eval("document.getElementById('page').textContent.includes('Reading your threads')")));
await page.goto(B + "/");
await wait(600);

// ---- in a tale
await page.click("#page [data-open]");
await wait(1400);
const home = await seen('#bar [data-home]');
// A ‹ pill like the others since 2026-10-25 ("just make it the back button that matches the other buttons").
ok(`a tale shows the way back to the library, a ‹ pill like the others (${JSON.stringify(home)})`,
   home === '‹' && (await page.eval("document.querySelector('#bar [data-home]').classList.contains('pill')")));
// HER WEB IS THE TALE'S MENU since 2026-10-26 (Seth: "make the web icon at the top open what the
// three dots open and then remove the three dots").
const more = await page.eval(`(() => { const b = document.querySelector('#bar .pill[data-railview="story"]');
  return b ? JSON.stringify({ web: !!b.querySelector('svg'), dots: /⋯/.test(b.textContent) }) : null; })()`).then((x) => x && JSON.parse(x));
ok(`  and her web for the tale's menu, with no ⋯ (${JSON.stringify(more)})`, !!more && more.web && !more.dots
   && !(await page.eval("[...document.querySelectorAll('#bar button')].some((b) => b.textContent.trim() === '⋯')")));
await page.click('#bar .pill[data-railview="story"]');
await wait(500);
ok("  and the web opens the menu", await railOpen());
ok("  which has no row for Talk: it is the quill held down (2026-10-28)", await page.eval("!document.querySelector('[data-nav=\"anansi\"]')"));
await page.eval("(() => { document.getElementById('scrim').click(); return 1; })()");
await wait(500);

// ---- one tap on a passage
const hint = await seen('#col .taphint');
ok(`the newest passage says how to reach its actions (${JSON.stringify(hint)})`, /Tap a passage/.test(hint ?? ''));
ok("no tray is open to begin with", !(await tray()));
await page.click("#col .block.newest .narr, #col .block.newest .said");
await wait(500);
ok("one tap on a passage opens its actions", await tray());
await backdrop();
await wait(500);
ok("  and a tap on the backdrop shuts them", !(await tray()));

// The habit the old door taught. The second tap lands on the scrim or on the sheet, and neither
// may shut the tray or press a button in it: Delete is a two-press, and Reweave writes.
const before = await page.eval("document.querySelectorAll('#col .block').length");
await page.dbl("#col .block.newest .narr, #col .block.newest .said");
await wait(700);
ok("a double tap still leaves the actions open", await tray());
ok("  and pressed nothing on the sheet",
   (await page.eval("document.querySelectorAll('#col .block').length")) === before
   && !(await page.eval("document.documentElement.dataset.rerollsheet === '1'"))
   // A two-press button wears an outline between its presses (armDelete), so an outline is the
   // first half of a deletion having happened.
   && !(await page.eval("[...document.querySelectorAll('.acts button')].some((b) => !!b.style.outline)")));
await wait(300);
await backdrop();
await wait(500);

// The guard itself, pinned: a press on the sheet straight after the tap that opened it. Where the
// second tap of a double tap lands depends on the passage's place on screen, so the double tap
// above cannot prove the guard on its own — it passed with the guard removed.
await backdrop();
await wait(600);
// A dispatched click rather than page.click: the driver's press takes longer than the guard lasts.
// It goes through the same capture listener a finger's click does.
await page.click("#col .block.newest .narr, #col .block.newest .said");
await page.eval("(() => { document.querySelector('.block[aria-expanded=\"true\"] .acts [data-memo]').click(); return 1; })()");
await wait(400);
const pressed = { open: await tray(), asked: await page.eval("!!document.querySelector('.acts [data-memo]')?.disabled") };
ok(`a press on the sheet in the same moment it opened does nothing (${JSON.stringify(pressed)})`,
   pressed.open && !pressed.asked);
await backdrop();
await wait(500);

// A tap on something INSIDE the passage is that thing's, not the tray's.
const chip = await page.eval("!!document.querySelector('#col .block .flag')");
if (chip) {
  await page.click('#col .block .flag');
  await wait(400);
  ok("a tap on a flag in a passage opens the flag, not the tray", !(await tray()));
} else ok("(no flag in the fixture to tap: the exclusion is untested here)", true);

// ---- back to the library
await page.click('#bar [data-home]');
await wait(900);
ok("‹ goes back to the library",
   !!(await seen('#bar .hdoor[data-railview="workspace"]')) && (await page.eval("location.hash")) === "");

// ---- the Titan's square, 360 by 360: every door on screen, and the header not wider than it
await page.viewport(360, 360);
await page.click("#page [data-open]");
await wait(1400);
const fit = await page.eval("(() => { const b = document.getElementById('bar');"
  + " return { over: b.scrollWidth - b.clientWidth, doors: [...b.querySelectorAll('button')]"
  + " .filter((x) => x.getBoundingClientRect().width > 0)"
  + " .filter((x) => x.getBoundingClientRect().right > innerWidth + 1).map((x) => x.getAttribute('aria-label') || x.textContent.trim()) }; })()");
ok(`on a 360px square the header fits (${fit.over}px over, off screen: ${JSON.stringify(fit.doors)})`,
   fit.over <= 0 && fit.doors.length === 0);
ok("  with the way back and her web both on it",
   !!(await seen('#bar [data-home]')) && await page.eval("!!document.querySelector('#bar .pill[data-railview=\"story\"] svg')"));
// A short screen keeps the prose: no stats band, and the mode row only while you are writing.
const shown = (id) => page.eval(`(() => { const e = document.getElementById('${id}'); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; })()`);
ok("on the square the stats band is hidden", !(await shown('ctxread')));
ok("  and so is the mode row while you are reading", !(await shown('modes')));
await openDock();
await page.click('#input');
await wait(400);
ok("  and the mode row comes back when you tap into the box", await shown('modes'));

console.log(red ? `\n  ${red} RED` : "\n  all green");
