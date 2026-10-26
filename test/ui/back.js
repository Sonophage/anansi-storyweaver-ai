// The phone's Back button, and Esc, against a drawer.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/back.js
//
// The usability check of 2026-10-24 found Back LEFT THE TALE with a drawer open: drawers wrote their
// name into the address with replaceState, so the drawer never had a history entry of its own and
// Back went to whatever page came before Anansi. And Esc shut a drawer but left its name in the
// address, so a reload opened it again. Both are asserted here by what a writer sees.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (m, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${m}${cond ? "" : "   <-- broken"}`); if (!cond) red++; };

await page.mobile();
await page.goto(B + "/");
await wait(900);

const state = () => page.eval("(() => ({ hash: location.hash, tale: !!document.querySelector('#bar [data-railview=\"story\"]'),"
  + " drawer: !document.getElementById('side').hidden }))()");

await page.click("#page [data-open]");
await wait(1400);
const tale = await state();
ok(`a tale opens from the rack (${JSON.stringify(tale)})`, tale.tale && !tale.drawer && /^#[^/]+$/.test(tale.hash));

// A drawer, opened the way a writer opens one: a press on a control, not a pasted address.
await page.eval("(() => { document.querySelector('#bar [data-railview=\"story\"]').click(); document.querySelector('[data-nav=\"anansi\"]').click(); return 1; })()");
await wait(700);
const open = await state();
ok(`a press opens a drawer and names it in the address (${JSON.stringify(open)})`,
   open.drawer && open.hash === tale.hash + "/anansi");

await page.eval("(() => { history.back(); return 1; })()");
await wait(900);
const back = await state();
ok(`Back shuts the drawer and stays in the tale (${JSON.stringify(back)})`,
   back.tale && !back.drawer && back.hash === tale.hash);

// The ✕ path: a drawer shut by a press must not leave a dead entry for Back to land on. The
// press is `data-panel=""`, the same action the drawer's own close button carries.
await page.eval("(() => { document.querySelector('#bar [data-railview=\"story\"]').click(); document.querySelector('[data-nav=\"anansi\"]').click(); return 1; })()");
await wait(700);
const len = await page.eval("history.length");
await page.eval("(() => { document.querySelector('#side [data-panel=\"\"]').click(); return 1; })()");
await wait(900);
const shut = await state();
ok(`the drawer's close shuts it and clears the address (${JSON.stringify(shut)})`,
   !shut.drawer && shut.hash === tale.hash);
await page.eval("(() => { history.back(); return 1; })()");
await wait(1100);
const after = await state();
ok(`  and the next Back goes to the rack, not to the same tale again (${JSON.stringify(after)}, ${len} entries)`,
   !after.tale && after.hash === "");

// Esc. The keyboard path set the panel to null and repainted without touching the address.
await page.click("#page [data-open]");
await wait(1400);
await page.eval("(() => { document.querySelector('#bar [data-railview=\"story\"]').click(); document.querySelector('[data-nav=\"anansi\"]').click(); return 1; })()");
await wait(700);
await page.key("Escape", 27);
await wait(500);
const esc = await state();
ok(`Esc shuts the drawer and takes its name out of the address (${JSON.stringify(esc)})`,
   esc.tale && !esc.drawer && /^#[^/]+$/.test(esc.hash));
await page.goto(B + "/" + esc.hash);
await wait(1400);
const reload = await state();
ok(`  so a reload does not open it again (${JSON.stringify(reload)})`, reload.tale && !reload.drawer);

// ---- the three that cover a tale without being drawers: Look, the full-screen composer, Reading.
// Back went past them and left the tale (second usability check, 2026-10-25).
const layer = (sel, open) => page.eval(`(() => { ${open}; return 1; })()`);
const covers = [
  ['the Look sheet', "document.querySelector('#bar [data-appearance]').click()", "!document.getElementById('appearance').hidden"],
  ['the full-screen composer', "document.querySelector('[data-bigin]').click()", "document.getElementById('dock').classList.contains('big')"],
  ['Reading mode', "document.querySelector('#bar [data-readmode]').click()", "document.documentElement.dataset.reading === '1'"],
];
for (const [name, open, isOpen] of covers) {
  await page.goto(B + "/");
  await wait(600);
  await page.click("#page [data-open]");
  await wait(1400);
  await layer(name, open);
  await wait(600);
  const up = await page.eval(isOpen);
  await page.eval("(() => { history.back(); return 1; })()");
  await wait(900);
  const s1 = await state();
  ok(`Back shuts ${name} and stays in the tale (${up}, ${JSON.stringify(s1)})`, up && s1.tale && !(await page.eval(isOpen)));
}
// A drawer opened over Reading mode: Back shuts the drawer and keeps Reading mode.
await page.goto(B + "/");
await wait(600);
await page.click("#page [data-open]");
await wait(1400);
await layer('read', "document.querySelector('#bar [data-readmode]').click()");
await wait(500);
await page.eval("(() => { document.querySelector('#bar [data-railview=\"story\"]').click(); document.querySelector('[data-nav=\"anansi\"]').click(); return 1; })()");
await wait(600);
await page.eval("(() => { history.back(); return 1; })()");
await wait(900);
const s3 = await state();
ok(`over Reading mode, Back shuts the drawer and keeps reading (${JSON.stringify(s3)})`,
   s3.tale && !s3.drawer && (await page.eval("document.documentElement.dataset.reading === '1'")));

// Shut by its own control, then Back: no dead entry, straight to the rack.
await page.goto(B + "/");
await wait(600);
await page.click("#page [data-open]");
await wait(1400);
await layer('look', "document.querySelector('#bar [data-appearance]').click()");
await wait(500);
await layer('look', "document.querySelector('#appearance [data-appearance=\"0\"]').click()");
await wait(700);
await page.eval("(() => { history.back(); return 1; })()");
await wait(1100);
const s2 = await state();
ok(`the Look sheet shut by its ✕ leaves no dead Back press (${JSON.stringify(s2)})`, !s2.tale && s2.hash === "");

console.log(red ? `\n  ${red} RED` : "\n  all green");
