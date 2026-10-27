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

// ---- a swipe, from the card itself, which on a phone is most of what there is to touch. A string
// is chalked first, so the deck has a card on it whatever the steps above left.
await page.eval(`(async () => { await fetch('/api/string', { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ storyId: ${JSON.stringify(sid)}, string: { title: 'The debt nobody has called in', body: 'Owed since the spring.' } }) }); return 1; })()`);
await page.goto(B + "/#" + sid + "/waiting");
await until("!!document.querySelector('.deckcard:not([hidden])')");
const before = (await view(sid)).proposals.length + (await view(sid)).violations.length + (await view(sid)).strings.filter((x) => x.status === 'open').length;
const swiped = await page.eval(`(async () => {
  const card = document.querySelector('.deckcard:not([hidden])');
  const from = card.querySelector('summary, .decktitle') ?? card;
  const r = from.getBoundingClientRect(), y = r.top + r.height / 2, x0 = r.left + 20;
  const ev = (type, x) => from.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerType: 'touch', isPrimary: true }));
  ev('pointerdown', x0);
  for (let i = 1; i <= 8; i++) ev('pointermove', x0 - i * 30);
  const lean = card.dataset.lean;
  ev('pointerup', x0 - 240);
  return lean; })()`);
await wait(1200);
const after = (await view(sid)).proposals.length + (await view(sid)).violations.length + (await view(sid)).strings.filter((x) => x.status === 'open').length;
ok(`a swipe left from a section's heading leans the card and says no (lean ${swiped}, ${before} -> ${after} waiting)`,
   swiped === 'left' && after === before - 1);

// ---- EVERY YES AND NO MOVES ON (Seth, 2026-10-26: "pressing an action or sliding it doesn't move on
// to the next card"). A summon leaves the string open, so its card stayed on top and said Dismiss.
await page.eval(`(async () => { await fetch('/api/string', { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ storyId: ${JSON.stringify(sid)}, string: { title: 'The letter in the drawer', body: 'Unopened.' } }) }); return 1; })()`);
await page.goto(B + "/#" + sid + "/waiting");
await until("!!document.querySelector('.deckcard:not([hidden])')");
const topTitle = () => page.eval("document.querySelector('.deckcard:not([hidden]) .decktitle')?.innerText ?? ''");
// The knot below rides in on the story view the summon fetches; see there.
const kv = await view(sid);
const ke = kv.entries.find((x) => x.entryType === 'character');
await page.eval(`(() => { const real = window.fetch;
  window.fetch = async (...a) => { const r = await real(...a);
    if (!/\\/api\\/(story|mute)/.test(String(a[0]))) return r;
    const j = await r.clone().json().catch(() => null);
    if (!j || !Array.isArray(j.violations)) return r;
    j.violations.push({ id: 'v-planted', entryId: ${JSON.stringify(ke.id)}, passageId: ${JSON.stringify(kv.passages[0].id)},
      quote: 'a line the thread disagrees with', status: 'open' });
    return new Response(JSON.stringify(j), { headers: { 'content-type': 'application/json' } }); };
  return 1; })()`);
for (let i = 0; i < 12 && (await topTitle()) !== 'The letter in the drawer'; i++) {
  await page.eval("(() => { document.querySelector('[data-deckmove=\"1\"]:not([disabled])')?.click(); return 1; })()"); await wait(150); }
ok("the string is on the deck", (await topTitle()) === 'The letter in the drawer');
await page.eval("(() => { document.querySelector('.deckcard:not([hidden]) [data-deckright]')?.click(); return 1; })()");
await wait(1200);
const letter = (await view(sid)).strings.find((x) => x.title === 'The letter in the drawer');
ok("a summon from the deck summons it", !!letter?.summoned);
ok("  and leaves the deck, so the next card is on top",
   !(await page.eval("[...document.querySelectorAll('.deckcard .decktitle')].some((t) => t.innerText === 'The letter in the drawer')")));

// A KNOT, IGNORED, LEAVES TOO: its thread is muted, and the knot stayed on top saying Ignore. The
// fixture has no knot and nothing without a model makes one, so the page's story view was given
// one before the summon above, whose fetch brought it in.
await until("!!document.querySelector('.deckcard[data-deckkind=\"knot\"]')", 20);
for (let i = 0; i < 12 && !(await page.eval("document.querySelector('.deckcard:not([hidden])')?.dataset.deckkind === 'knot'")); i++) {
  await page.eval("(() => { document.querySelector('[data-deckmove=\"1\"]:not([disabled])')?.click(); return 1; })()"); await wait(150); }
ok("the planted knot is on the deck", await page.eval("document.querySelector('.deckcard:not([hidden])')?.dataset.deckkind === 'knot'"));
await page.eval("(() => { document.querySelector('.deckcard:not([hidden]) [data-deckleft]')?.click(); return 1; })()");
await wait(1200);
ok("  and Ignore moves on from it", !(await page.eval("[...document.querySelectorAll('.deckcard')].some((c) => c.dataset.deckkind === 'knot')")));
await page.eval(`(async () => { await fetch('/api/mute', { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ storyId: ${JSON.stringify(sid)}, chapterId: ${JSON.stringify(kv.currentChapter.id)}, entryId: ${JSON.stringify(ke.id)}, off: true }) }); return 1; })()`);

console.log(red ? `\n  ${red} RED` : "\n  all green");
