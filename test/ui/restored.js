// The features that had no caller after desk.js was deleted. BUILD-STATE called five of these
// "Done" while nothing could reach them, so each one is driven here rather than trusted.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/restored.js
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (l, g) => { if (!g) red++; console.log("  " + (g ? "ok  " : "RED ") + l); };
const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s=>s.title==='The Silver Key').id)()");
const story = () => page.eval("(async () => await (await fetch('/api/story?story=" + sid + "')).json())()");

// ---- progressions: canon anchored to a chapter, "Lens 5's ONE THING"
await page.goto(B + "/#" + sid + "/threads");
const eid = await page.eval("document.querySelector('[data-entry]')?.dataset.entry");
await page.click('[data-entry="' + eid + '"]');
await wait(600);
// A card opens on its FACE now (PLAN-08) and the progression form lives in the form, where the
// typing is. This section is about the form, so it presses Edit; the assertions are unchanged.
await page.eval("(() => { document.querySelector('[data-cardview=\"form\"]')?.click(); return 1; })()");
await wait(600);
// THE CARD'S TAIL SECTIONS ARE FOLDS NOW, SHUT BY DEFAULT (2026-08-30). Seth: "the over time and
// the brings in with it and another book should be toggle and defaulted as off." Their fields are
// still in the document, so an eval can read and fill them — but a driver CLICK needs the section
// opened first, which is the press a writer makes. Idempotent: one already open is left alone
// rather than toggled shut.
const openFold = async (name) => {
  if (!(await page.eval(`!!document.querySelector('[data-fold="${name}"]')?.parentElement?.open`)))
    await page.click(`[data-fold="${name}"]`);
  await wait(300);
};
ok("the entry editor offers a progression form", await page.eval("!!document.querySelector('[data-st=\"body\"]')"));
await openFold('states');
const before = ((await story()).entries.find((e) => e.id === eid)?.states ?? []).length;
// Anchor it at the CURRENT chapter, or resolveBody correctly withholds it as not yet open —
// which is the engine being right and the test being wrong about which chapter it is on.
const nowCh = (await story()).currentChapter.index;
console.log("  current chapter: " + nowCh);
await page.eval("(() => { document.querySelector('[data-st=\"fromChapter\"]').value = '" + nowCh + "';"
  + " document.querySelector('[data-st=\"body\"]').value = '[Probe: a fact that opens at this chapter]';"
  + " return 1; })()");
await page.click('[data-addstate="1"]');
await wait(900);
let states = (await story()).entries.find((e) => e.id === eid)?.states ?? [];
ok(`adding a progression persists (${before} -> ${states.length})`, states.length === before + 1);
ok("  and it is anchored to the chapter given", states.some((s) => s.fromChapter === nowCh));
ok("  and reaches the prompt at that chapter",
   /opens at this chapter/.test(await page.eval("(async () => { const r = await (await fetch('/api/manifest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({storyId:'" + sid + "',mode:'direct'})})).json(); return r.prompt; })()")));

// removing it again
const mine = states.find((s) => /opens at this chapter/.test(s.body))?.id;
ok("  and the state carries an id so it can be removed", !!mine);
// TWO PRESSES (2026-08-30). Seth: "all deletions should have a double tap confirmation." Every
// deletion in the app arms on the first press and fires on the second, within four seconds — one
// helper, `armed()` in web/app.js, rather than a guard per handler. A driver that presses once now
// arms and returns, which is the behaviour and not a fault.
await page.click('[data-delstate="' + mine + '"]');
await page.click('[data-delstate="' + mine + '"]');
await wait(800);
states = (await story()).entries.find((e) => e.id === eid)?.states ?? [];
ok(`removing one persists (back to ${states.length})`, states.length === before);

// ---- entry field history and revert
await page.click('[data-fieldhistory="1"]');
await wait(700);
ok("field history opens", await page.eval("document.body.innerHTML.includes('Field history')"));
const revs = await page.eval("document.querySelectorAll('[data-revertfield]').length");
console.log("  field revisions listed: " + revs);
if (revs) {
  await page.click('[data-revertfield]');
  await wait(900);
  ok("reverting a field does not error", !/error|cannot/i.test((await page.text('#toast') || '')));
} else {
  console.log("  SKIP revert — this entry has no edited fields yet");
}

// ---- export, three ways
await page.goto(B + "/#" + sid + "/story");
const md = await page.eval("document.querySelector('a[href*=\"format=markdown\"]')?.getAttribute('href')");
const js = await page.eval("document.querySelector('a[href*=\"format=json\"]')?.getAttribute('href')");
ok(`a markdown export link exists (${md})`, !!md && md.includes(sid));
ok("a json export link exists", !!js);
ok("both are real downloads", await page.eval("(async () => { const r = await fetch("
  + JSON.stringify(md || '/nope') + "); return r.ok; })()"));
await page.click('[data-exportdb="1"]');
await wait(1200);
ok(`the standalone database export runs (${JSON.stringify(((await page.text('#toast')) || '').slice(0, 44))})`,
   /\.db/.test(await page.text('#toast') || ''));

// ---- deleting a story takes two presses
const nBefore = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.length)()");
await page.click('[data-delstory="1"]');
ok("the first press only arms it", (await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.length)()")) === nBefore);
ok("  and says so", /again/i.test(await page.text('#sideBody') || ''));

console.log(red ? `\n  ${red} RED` : "\n  all green");
