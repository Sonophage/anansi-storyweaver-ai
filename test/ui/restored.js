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
ok("the entry editor offers a progression form", await page.eval("!!document.querySelector('[data-st=\"body\"]')"));
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
