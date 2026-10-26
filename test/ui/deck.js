// The Workbench deck (#74): one card at a time, yes on the right and no on the left, by a press,
// an arrow key or a swipe, with an undo for a no.
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

console.log(red ? `\n  ${red} RED` : "\n  all green");
