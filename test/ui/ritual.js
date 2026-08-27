// The end-of-chapter ritual and the next chapter's setup page. Calls the model twice (summarise
// on close, then extraction), so this is minutes, not seconds.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/ritual.js
//
// Point it at a COPY. It closes a chapter and pins entries.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (l, g) => { if (!g) red++; console.log("  " + (g ? "ok  " : "RED ") + l); };
const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s=>s.title==='The Silver Key').id)()");
const story = () => page.eval("(async () => await (await fetch('/api/story?story=" + sid + "')).json())()");

// The ritual needs prose in the chapter it closes, or there is nothing to summarise.
await page.eval("(async () => { const v = await (await fetch('/api/story?story=" + sid + "')).json();"
  + " for (const body of ['Aldis waited on the stair while the rain went on.',"
  + " 'Marek came up without a lamp and did not explain how he had found the door.']) {"
  + " await fetch('/api/write', { method:'POST', headers:{'Content-Type':'application/json'},"
  + " body: JSON.stringify({ storyId:'" + sid + "', body }) }); } })()");

const before = await story();
const closing = before.currentChapter;
const chBefore = before.chapters.length;

// End this chapter lives on the Chapter panel now, not on Story — the two were one panel until
// the six-panel rearrangement, and closing a chapter is the chapter's business.
await page.goto(B + "/#" + sid + "/chapter");
for (let i = 0; i < 40 && !(await page.visible('[data-ritual="1"]')); i++) await wait(250);
await page.click('[data-ritual="1"]');
console.log("  ritual running (summarise, then extraction)…");
for (let i = 0; i < 120; i++) {
  if (await page.visible('[data-savesetup="1"]')) break;
  await wait(1000);
}

// ---- the ritual's three steps
ok("the setup panel opens when the ritual finishes", await page.visible('[data-savesetup="1"]'));
const head = (await page.text('#sideHead') || '');
ok(`  and it is titled for the next chapter (${JSON.stringify(head.replace(/\s+/g,' ').trim().slice(0,28))})`,
   /next chapter/i.test(head));
const body = (await page.text('#sideBody') || '');
console.log("  ritual report: " + body.replace(/\s+/g, ' ').slice(0, 150));
ok("  it reports the summary it wrote", /Summarised|summary did not/.test(body));
// NOT `|Could not read`, which is what this said until 2026-08-27. The wording it looked for —
// "proposed for the ledger" — was renamed to "proposed as threads" when the ledger became Threads,
// and the assertion was never updated. So for as long as extraction FAILED here it passed on its
// own failure branch, and the day extraction started working on chapter close it went red. An
// assertion that accepts the error message as a pass cannot fail. Same family as the two inert
// blocks in this file that .claude/CLAUDE.md records.
ok(`  and what extraction proposed (${JSON.stringify((body.match(/\d+ proposed as threads|Could not read[^.]*/) ?? ['nothing'])[0])})`,
   /\d+ proposed as threads/.test(body));

const after = await story();
ok(`the chapter closed and the next opened (${chBefore} -> ${after.chapters.length})`, after.chapters.length === chBefore + 1);
ok("  you are in the new one", after.currentChapter.id !== closing.id);
const closed = after.chapters.find((c) => c.id === closing.id);
ok(`  and the one you left is summarised (${(closed?.summary ?? '').length} chars)`, !!closed?.summary);
ok("  nothing was accepted into the ledger automatically",
   after.entries.length === before.entries.length);

// ---- the setup page's three fields, all writing to things that already exist
ok("the beat says it is not set yet", /Not set/.test(body));
// Typed with real keystrokes, not by assigning .value: the panel keeps the form in state via the
// input event, and a programmatic assignment fires no event — which is the test's problem, not the
// app's, but it looked identical to the bug for one run.
await page.eval("(() => { for (const k of ['title','note']) document.querySelector(`[data-setup=\"${k}\"]`).value = ''; return 1; })()");
await page.type('[data-setup="title"]', 'The Stair');
await page.type('[data-setup="note"]', 'It has to end with Aldis handing the key over.');

// Who is in it. One control, two mechanisms — and which one depends on how the entry already
// reaches the prompt, so the assertion has to branch the same way the app does.
//
// This block used to be guarded by `if (castBtn)` and SILENTLY SKIPPED: the setup page offered
// only triggered entries, the fixture's characters are all always-on, so the selector matched
// nothing and two assertions never ran. Always-on entries are offered now, which is what
// surfaced it.
const castBtn = await page.eval("document.querySelector('[data-pin]')?.dataset.pin");
ok("the setup page offers at least one character to tick", !!castBtn);
if (castBtn) {
  const before = await story();
  const ent = before.entries.find((e) => e.id === castBtn);
  const always = ent?.activation === 'always_on';
  console.log(`  ticking ${JSON.stringify(ent?.title)} (${ent?.activation})`);
  await page.click('[data-pin="' + castBtn + '"]');
  await wait(900);
  const v = await story();
  const pin = (v.pins ?? []).find((p) => p.entryId === castBtn && p.chapterId === v.currentChapter.id);
  // An always-on entry is already sent, so the only move is to hold it OUT. A triggered one is
  // pushed IN. context.ts applies force_out first, before the always-on branch, so both land.
  ok(`ticking a character writes the right kind of pin (${pin?.mode})`,
     pin?.mode === (always ? 'force_out' : 'force_in'));
  const reasons = await page.eval("(async () => { const r = await (await fetch('/api/manifest',{method:'POST',"
    + "headers:{'Content-Type':'application/json'},body:JSON.stringify({storyId:'" + sid + "',mode:'continue'})})).json();"
    + " return r.manifest.blocks.filter(b => b.id === '" + castBtn + "').map(b => b.state + ':' + b.reason).join(','); })()");
  ok(`  and the prompt obeys it (${JSON.stringify(reasons)})`,
     always ? /omitted:pinned out/.test(reasons) : /included:pinned in/.test(reasons));
  await page.click('[data-pin="' + castBtn + '"]');
  await wait(900);
  const v2 = await story();
  ok("  and clicking again clears it", !(v2.pins ?? []).some((p) => p.entryId === castBtn && p.chapterId === v2.currentChapter.id));
  // Leave it as the fixture had it, so later assertions read a story nobody has quietly changed.
  if (!always) { await page.click('[data-pin="' + castBtn + '"]'); await wait(700); }
}

// where -> the same mechanism on a lore entry
const placeBtn = await page.eval("document.querySelector('[data-place]')?.dataset.place");
if (placeBtn) {
  await page.click('[data-place="' + placeBtn + '"]');
  await wait(900);
  const v = await story();
  ok("pinning a place uses the same mechanism",
     (v.pins ?? []).some((p) => p.entryId === placeBtn && p.mode === 'force_in'));
}

// ---- saving writes the beat where the engine already reads it
// The form must survive a repaint. Ticking a character used to rebuild the panel and empty it.
ok("what was typed survived ticking a character",
   (await page.eval("document.querySelector('[data-setup=\"note\"]')?.value")) === 'It has to end with Aldis handing the key over.');
await page.click('[data-savesetup="1"]');
await wait(1200);
const saved = (await story()).currentChapter;
ok(`saving writes the title (${JSON.stringify(saved.title ?? '')})`, saved.title === 'The Stair');
ok("  and the beat", /handing the key over/.test(saved.authorsNote ?? ''));
ok("  and the beat reaches DIRECTIVE",
   /handing the key over/.test(await page.eval("(async () => { const r = await (await fetch('/api/manifest',{method:'POST',"
     + "headers:{'Content-Type':'application/json'},body:JSON.stringify({storyId:'" + sid + "',mode:'direct'})})).json();"
     + " return r.prompt; })()")));
ok("  and it leaves you on the document", !/next chapter/i.test(await page.text('#sideHead') || ''));

console.log(red ? `\n  ${red} RED` : "\n  all green");
