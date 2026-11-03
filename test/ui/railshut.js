// THE DESK'S COLLAPSED MENU, measured (Seth, 2026-11-02: "the menu on desktop when its collapsed
// needs some work"). Collapsed, the 76px rail drew the open menu's two columns squeezed into it: the
// scene list as slivers of cover art, the tile icons cut in half, the search box an empty pill and the
// model gone. Now it is one column of whole icons, the one you are on marked, each named in its title;
// the model's dot at the top; on a tale, a search icon that opens the menu at the box.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/railshut.js
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (m, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${m}${cond ? "" : "   <-- broken"}`); if (!cond) red++; };

await page.viewport(1440, 900);
// ONE CONTROL ON A DESK (#133): the header's menu icon opens and shuts the menu; the rail has no
// close of its own there. In a tale it is the tale menu's door, on the Library the main menu's.
const door = async () => (await page.eval("!!document.querySelector('#bar [data-railview=\"story\"]')"))
  ? '#bar [data-railview="story"]' : '#bar [data-railview="workspace"]';
const shut = async () => {
  if (await page.eval("document.documentElement.dataset.uiRail !== 'closed'")) await page.click(await door());
  await wait(500);
};
const measure = () => page.eval(`(() => {
  const rail = document.getElementById('rail').getBoundingClientRect();
  const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0'; };
  const inside = (r, o) => r.left >= o.left - 0.5 && r.right <= o.right + 0.5 && r.top >= o.top - 0.5 && r.bottom <= o.bottom + 0.5;
  const tiles = [...document.querySelectorAll('#rail .railtile')].filter(vis);
  const icon = (t) => t.querySelector('.tileicon').getBoundingClientRect();
  const model = document.querySelector('#rail [data-modelmenu]');
  const close = document.querySelector('#rail .railclose');
  return {
    width: Math.round(rail.width),
    tiles: tiles.length,
    columns: new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().left))).size,
    whole: tiles.every((t) => inside(icon(t), t.getBoundingClientRect()) && inside(icon(t), rail)),
    words: tiles.filter((t) => vis(t.querySelector('.txt'))).length,
    named: tiles.every((t) => !!t.getAttribute('title')),
    current: tiles.filter((t) => t.hasAttribute('aria-current')).length,
    list: vis(document.querySelector('#rail .tale3scenes')),
    box: vis(document.querySelector('#rail .railsearch')),
    find: vis(document.querySelector('#rail [data-railfind]')),
    model: vis(model) && inside(model.getBoundingClientRect(), rail),
    close: !!close,
  };
})()`);

// ---- a tale, with Threads open so a tile is the current one
await page.goto(B + "/");
await wait(900);
await page.click("#page [data-open]");
await wait(1500);
await page.eval("(() => { document.querySelector('#rail [data-nav=\"threads\"]')?.click(); return 1; })()");
await wait(700);
await shut();
let m = await measure();
console.log("  tale: " + JSON.stringify(m));
ok(`the collapsed menu is 76px wide (${m.width})`, m.width === 76);
ok(`  its tiles are one column (${m.columns})`, m.tiles > 0 && m.columns === 1);
ok("  every icon is whole, inside its tile and the strip", m.whole);
ok(`  no tile shows its word (${m.words})`, m.words === 0);
ok("  every tile names itself in its title", m.named);
ok(`  the panel you are on is marked (${m.current})`, m.current === 1);
ok("  the scene list is not drawn into the strip", !m.list);
ok("  nor the search box", !m.box);
ok("  a search icon stands in for it", m.find);
ok("  the model's dot is inside the strip", m.model);
ok("  and the strip has no close of its own: the header's icon is the one control (#133)", !m.close);
if (m.find) await page.click('#rail [data-railfind]');
await wait(700);
ok("the search icon opens the menu", await page.eval("document.documentElement.dataset.uiRail === 'open'"));
ok("  with the cursor in the search box", await page.eval("!!document.activeElement?.matches?.('.railsearch')"));

// ---- the library's menu
await page.goto(B + "/");
await wait(1200);
await shut();
m = await measure();
console.log("  library: " + JSON.stringify(m));
ok(`the library's collapsed menu is 76px wide (${m.width})`, m.width === 76);
ok(`  its tiles are one column (${m.columns})`, m.tiles > 0 && m.columns === 1);
ok("  every icon is whole", m.whole);
ok(`  no tile shows its word (${m.words})`, m.words === 0);
ok("  every tile names itself in its title", m.named);
ok(`  the Library is marked (${m.current})`, m.current === 1);
ok("  the list of tales is not drawn into the strip", !m.list);
ok("  the model's dot is inside the strip", m.model);
ok("  and no close of its own", !m.close);
await page.click(await door());
await wait(500);
ok("the header's menu icon opens it again", await page.eval("document.documentElement.dataset.uiRail === 'open'"));
ok("  and open, it still has no close of its own", !(await page.eval("!!document.querySelector('#rail .railclose')")));

// ---- where the menu covers the screen its ✕ stays: the only way out you can see
await page.mobile(390, 844);
await page.goto(B + "/");
await wait(1200);
if (await page.eval("document.documentElement.dataset.uiRail !== 'open'")) await page.click('#bar [data-railview="workspace"]');
await wait(600);
ok("on a phone the open menu has its ✕", await page.eval("/\u2715/.test(document.querySelector('#rail .railclose')?.textContent ?? '')"));
await page.click('#rail .railclose');
await wait(600);
ok("  and it closes the menu", await page.eval("document.documentElement.dataset.uiRail === 'closed'"));

console.log(red ? `\n  ${red} RED` : "\n  all green");
