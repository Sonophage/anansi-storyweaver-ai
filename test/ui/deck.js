// The Workbench deck (#74): one card at a time, yes on the right and no on the left, by a press,
// an arrow key or a swipe, with an undo for a no. The press and the arrow key are checked here; the
// swipe and the string cards were, until they failed on main and Seth had them taken out
// (2026-10-30), so nothing here checks a swipe or a string.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/deck.js
//
// The fixture plants one chalked thread, The Vantic Rain; a second is chalked here so there is a
// deck of two to move through.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (m, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${m}${cond ? "" : "   <-- broken"}`); if (!cond) red++; };
const until = async (expr, n = 40, ms = 250) => { for (let i = 0; i < n; i++) { if (await page.eval(expr)) return true; await wait(ms); } return false; };
const view = (sid) => page.eval(`(async () => JSON.stringify(await (await fetch('/api/story?story=${sid}')).json()))()`).then(JSON.parse);
const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find((s) => s.title === 'The Silver Key').id)()");

await page.goto(B + "/#" + sid + "/waiting");
await until("!!document.querySelector('[data-deck]')");
const shape = await page.eval(`JSON.stringify((() => { const all = [...document.querySelectorAll('.deckcard')];
  return { n: all.length, shown: all.filter((c) => !c.hidden).length,
    top: all.find((c) => !c.hidden)?.innerText.slice(0, 120) ?? '',
    right: !!all.find((c) => !c.hidden)?.querySelector('[data-deckright]'),
    left: !!all.find((c) => !c.hidden)?.querySelector('[data-deckleft]') }; })())`).then(JSON.parse);
ok(`the Workbench is a deck, one card showing (${shape.n} cards, ${shape.shown} showing)`, shape.n >= 1 && shape.shown === 1);
ok("  with a yes on the right and a no on the left", shape.right && shape.left);

// ---- a no, and its undo
const rain = (await view(sid)).proposals.find((p) => p.title === 'The Vantic Rain');
ok("the planted thread is on the deck", !!rain && shape.top.includes('Vantic Rain'));

// ---- AT PHONE WIDTH (UX review, 2026-10-29): one Sew it in on a card of one thread, an Anansi edits
// a finger can hit, and a box whose hint is not cut off.
await page.viewport(390, 844);
await wait(400);
const fit = await page.eval(`JSON.stringify((() => { const card = document.querySelector('.deckcard:not([hidden])');
  const b = card?.querySelector('[data-anansiedit]'), box = card?.querySelector('[data-aeask]');
  const cs = box && getComputedStyle(box), ctx = document.createElement('canvas').getContext('2d');
  if (cs) ctx.font = cs.font;
  return { sew: [...(card?.querySelectorAll('button') ?? [])].filter((x) => /Sew it in/.test(x.textContent)).length,
    h: b ? Math.round(b.getBoundingClientRect().height) : 0,
    text: box ? Math.ceil(ctx.measureText(box.placeholder).width) : 0,
    room: box ? Math.floor(box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) : 0 }; })())`).then(JSON.parse);
ok(`ONE-SEW: the card says Sew it in once (${fit.sew})`, fit.sew === 1);
ok(`EDITS-44: Anansi edits is at least 44px tall (${fit.h}px)`, fit.h >= 44);
ok(`EDITS-HINT: the box's hint fits it (${fit.text}px of ${fit.room}px)`, fit.text > 0 && fit.text <= fit.room);
// ONE HEIGHT FROM CARD TO CARD (usability walkthrough, 2026-10-30): the sheet grew and shrank with each
// card, so Back and Next jumped under the thumb. Read on every card, then back to the first.
const heights = [];
for (let i = 0; i < 8; i++) {
  heights.push(await page.eval("Math.round(document.querySelector('.deckcard:not([hidden])')?.getBoundingClientRect().height ?? 0)"));
  if (!(await page.eval("!!document.querySelector('[data-deckmove=\"1\"]:not([disabled])')"))) break;
  await page.eval("(() => { document.querySelector('[data-deckmove=\"1\"]')?.click(); return 1; })()"); await wait(250);
}
ok(`DECK-STEADY: every card on the deck is one height (${heights.join(', ')}px)`,
   heights.length >= 2 && heights.every((h) => h > 0 && h === heights[0]));
for (let i = 0; i < 8 && (await page.eval("!!document.querySelector('[data-deckmove=\"-1\"]:not([disabled])')")); i++) {
  await page.eval("(() => { document.querySelector('[data-deckmove=\"-1\"]')?.click(); return 1; })()"); await wait(250); }
await page.viewport(1440, 900);
await wait(300);
await page.eval("(() => { document.querySelector('.deckcard:not([hidden]) [data-deckleft]')?.click(); return 1; })()");
await wait(900);
ok("the left button rejects it", !(await view(sid)).proposals.some((p) => p.id === rain.id));
ok("  and Undo appears", await until("!!document.querySelector('[data-deckundo]')", 12));
await page.eval("(() => { document.querySelector('[data-deckundo]')?.click(); return 1; })()");
await wait(900);
ok("  which puts it back on the deck", (await view(sid)).proposals.some((p) => p.id === rain.id));

// ---- a yes by the arrow key
await page.eval("(() => { document.activeElement?.blur(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); return 1; })()");
await wait(1200);
const v = await view(sid);
ok("the right arrow sews the top card in", !v.proposals.some((p) => p.id === rain.id) && v.entries.some((e) => e.title === 'The Vantic Rain'));
ok("  as a new thread whose text is its Always true",
   /gutters have given up/.test(v.entries.find((e) => e.title === 'The Vantic Rain')?.addons?.find((a) => a.slot === 'facts')?.body ?? ''));

// ---- ONE COUNT FOR THE WORKBENCH (UX review, 2026-10-29: at phone size the header said "1 new", the
// menu said 4 and the drawer said "3 to decide"). The out-of-reach card is worked out from what he
// reads, which lands after the first paint: the drawer was drawn without it and never again, and the
// header counted it as new. A first visit on this device, so nothing is new yet.
await page.mobile(390, 844);
await page.eval(`(() => { try { localStorage.removeItem('anansi.benchseen.${sid}'); } catch {} return 1; })()`);
await page.goto(B + "/#" + sid);
await page.eval("location.reload()");
await until("!!document.querySelector('[data-railview=\"story\"]')");
await wait(3000);
ok("BENCH-NEW: a first visit marks nothing new, even once what he reads has landed",
   !(await page.eval("!!document.querySelector('.benchnew')")));
await page.goto(B + "/#" + sid + "/waiting");
await until("!!document.querySelector('.deckhead')");
await wait(3000);
const decide = Number((await page.eval("document.querySelector('.deckhead')?.textContent ?? ''")).match(/(\d+) to decide/)?.[1] ?? -1);
const reach = await page.eval("[...document.querySelectorAll('.deckcard .decktitle')].some((t) => /no longer reach the model/.test(t.textContent))");
await page.eval("(() => { document.querySelector('[data-railview=\"story\"]')?.click(); return 1; })()");
await until("!!document.querySelector('[data-nav=\"waiting\"]')");
const menuN = Number(await page.eval("document.querySelector('[data-nav=\"waiting\"] .navcount')?.textContent ?? '-2'"));
ok(`BENCH-COUNT: the menu and the drawer give one number (menu ${menuN}, drawer ${decide})`, decide > 0 && menuN === decide);
ok("  and the drawer holds the out-of-reach card it counts", reach);

console.log(red ? `\n  ${red} RED` : "\n  all green");
