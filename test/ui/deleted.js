// Recently deleted (#169): Account's fifth tab. With nothing deleted it says so plainly; after one
// version of a passage with two is deleted from the passage's own actions, it lists that version
// with its text, its tale, its scene and when.
//
// Put back (#170): the row's Put back returns the version behind its passage's ‹ › pager (two
// versions again, the restored text one press of › away). A version whose passage has gone shows
// the reason and Copy, and no Put back. A long version opens whole on Show all. The clipboard is not
// read back: the harness may not grant it, so Copy is checked as present and wired.
//
//   test/ui/run.sh deleted
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (l, g) => { if (!g) red++; console.log("  " + (g ? "ok  " : "RED ") + l); };
const until = async (expr, n = 40) => {
  for (let i = 0; i < n; i++) { if (await page.eval(expr)) return true; await wait(250); }
  return false;
};
/** One call to the app's own routes, from inside the page, so it carries the page's session. */
const call = (path, body) => page.eval(`(async () => (await (await fetch(${JSON.stringify(path)},
  ${body ? `{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify(body))} }` : '{}'})).json()))()`);
const press = (sel) => page.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (e) e.click(); return !!e; })()`);
const openTab = async () => {
  await page.goto(B + "/");
  await until("!!document.querySelector('[data-nav=\"account\"]')");
  await press('[data-nav="account"]');
  await until("!!document.querySelector('[data-accttab=\"deleted\"]')");
  await press('[data-accttab="deleted"]');
  await until("!!document.querySelector('[data-deletedempty], [data-deletedrow]')");
};

await page.goto(B + "/");
const sid = (await call("/api/stories")).stories.find((s) => s.title === "The Silver Key").id;

// ---- the tab, and its empty state
await openTab();
const tabs = await page.eval("[...document.querySelectorAll('[data-accttab]')].map((b) => b.textContent.trim())");
ok(`Account has Recently deleted beside the other four (${JSON.stringify(tabs)})`,
  JSON.stringify(tabs) === JSON.stringify(["You", "Model", "Look", "Your books", "Recently deleted"]));
ok("  and it is the tab shown as pressed",
  (await page.eval("document.querySelector('[data-accttab=\"deleted\"]').getAttribute('aria-pressed')")) === "true");
const empty = await page.eval("document.querySelector('[data-deletedempty]')?.textContent.replace(/\\s+/g, ' ').trim() ?? null");
ok(`with nothing deleted it says plainly that nothing is waiting (${JSON.stringify(empty)})`,
  !!empty && /Nothing is waiting/.test(empty));
ok("  and lists no row", !(await page.eval("!!document.querySelector('[data-deletedrow]')")));

// ---- a passage with two versions, one deleted from its own actions
const view = await call(`/api/story?story=${sid}`);
const last = view.passages.at(-1);
const WORDS = "A second version of the last passage, for Recently deleted.";
await call("/api/accept", { storyId: sid, variantOf: last.id, body: WORDS, mode: "continue" });
const two = (await call(`/api/story?story=${sid}`)).passages.at(-1);
const gone = (two.variants ?? []).find((v) => v.selected)?.id ?? two.id;
ok(`the last passage has two versions (${(two.variants ?? []).length})`, (two.variants ?? []).length === 2);
await page.goto(B + "/#" + sid);
await until("!!document.querySelector('#col .block')");
// One tap on a passage opens its actions; Delete asks to be pressed again (as test/ui/buttons.js).
await page.click("#col .block.newest .narr, #col .block.newest .said");
await until(`!!document.querySelector('[data-del="${gone}"]')`);
await page.click(`[data-del="${gone}"]`); await wait(300);
await press(`[data-del="${gone}"]`); await wait(900);
const after = (await call(`/api/story?story=${sid}`)).passages.at(-1);
ok(`the delete took one version and kept the passage (${(after.variants ?? []).length || 1} left)`,
  after.id !== gone && ((after.variants ?? []).length || 1) === 1);

// ---- now listed
await openTab();
const rows = await page.eval(`[...document.querySelectorAll('[data-deletedrow]')].map((r) => ({ id: r.dataset.deletedrow,
  text: r.textContent.replace(/\\s+/g, ' ').trim() }))`);
ok(`one version is listed (${rows.length})`, rows.length === 1 && rows[0].id === gone);
const row = rows[0]?.text ?? "";
ok("  with its text", row.includes(WORDS));
ok("  its tale", row.includes("The Silver Key"));
const listed = (await call("/api/deleted")).versions?.[0] ?? {};
const where = await page.eval(`document.querySelector('[data-deletedrow] .hint')?.textContent.split('\u00b7').map((x) => x.trim()) ?? []`);
ok(`  its scene (${JSON.stringify(where[1])}; scene ${listed.sceneIndex}, ${JSON.stringify(listed.sceneTitle)})`,
  listed.sceneIndex != null && [listed.sceneTitle?.trim(), `Scene ${listed.sceneIndex}`].includes(where[1]));
ok("  and when", /deleted today/.test(row));
ok("  and no empty state beside it", !(await page.eval("!!document.querySelector('[data-deletedempty]')")));

// ---- Put back (#170)
const putBack = `[data-deletedback="${gone}"]`;
ok("the row has a Put back button", await page.eval(`!!document.querySelector('${putBack}')`));
ok("  whose label names the tale",
  /The Silver Key/.test(await page.eval(`document.querySelector('${putBack}')?.getAttribute('aria-label') ?? ''`)));
await press(putBack);
ok("pressed, the row leaves the list",
  await until(`!document.querySelector('[data-deletedrow="${gone}"]')`));
ok("  and the server no longer lists it", !((await call("/api/deleted")).versions ?? []).some((v) => v.id === gone));
const again = (await call(`/api/story?story=${sid}`)).passages.at(-1);
ok(`the passage has two versions again (${(again.variants ?? []).length})`, (again.variants ?? []).length === 2);
ok("  and the one shown is the one that stayed", again.id === after.id);
await page.goto(B + "/#" + sid);
await until("!!document.querySelector('#col .block.newest')");
await page.click("#col .block.newest .narr, #col .block.newest .said");
await until(`!!document.querySelector('[data-vn="${after.id}"]')`);
const pagerText = await page.eval(`document.querySelector('[data-vn="${after.id}"]')?.parentElement.textContent.replace(/\\s+/g, '') ?? ''`);
ok(`the pager counts two (${JSON.stringify(pagerText)})`, /1\/2/.test(pagerText));
// A real click after a short wait. A scripted click straight after the tray opened did not move the
// pager on 2026-11-13 (the selection stayed); the cause was not pinned down.
await wait(400); await page.click(`[data-vn="${after.id}"]`);
const reached = await until(`(document.querySelector('#col .block.newest')?.textContent ?? '').includes(${JSON.stringify(WORDS)})`);
ok("  and \u203a reaches the version put back", reached);

// ---- a long version whose passage is gone: the reason, Copy, Show all, and no Put back
const LONG = Array.from({ length: 9 }, (_, i) => `Line ${i + 1} of a long version whose passage goes.`).join("\n");
await call("/api/accept", { storyId: sid, body: "A passage that will go, first version.", mode: "continue" });
const fresh = (await call(`/api/story?story=${sid}`)).passages.at(-1);
await call("/api/accept", { storyId: sid, variantOf: fresh.id, body: LONG, mode: "continue" });
const longId = ((await call(`/api/story?story=${sid}`)).passages.at(-1).variants ?? []).find((v) => v.selected)?.id;
const del = (id, allTakes) => page.eval(`(async () => (await (await fetch('/api/passage', { method: 'DELETE',
  headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify({ storyId: sid, id, allTakes }))} })).json()))()`);
await del(longId, false);
await del(fresh.id, true);
await openTab();
const goneRow = `[data-deletedrow="${longId}"]`;
ok("the version whose passage went is listed", await page.eval(`!!document.querySelector('${goneRow}')`));
const reason = await page.eval(`document.querySelector('${goneRow} [data-deletedgone]')?.textContent.replace(/\\s+/g, ' ').trim() ?? ''`);
ok(`  it says why it cannot go back (${JSON.stringify(reason)})`, /passage is gone/.test(reason) && /cannot go back/.test(reason));
ok("  it has Copy", await page.eval(`!!document.querySelector('${goneRow} [data-copydeleted="${longId}"]')`));
await press(`${goneRow} [data-copydeleted="${longId}"]`);
const said = await until("/Copied\\.|Could not reach the clipboard/.test(document.getElementById('toast')?.textContent ?? '') && !document.getElementById('toast').hidden")
  ? await page.eval("document.getElementById('toast').textContent") : null;
ok(`  pressed, Copy answers (${JSON.stringify(said)})`, !!said);
ok("  and no Put back", !(await page.eval(`!!document.querySelector('${goneRow} [data-deletedback]')`)));
const hidden = `(() => { const b = document.querySelector('${goneRow} [data-deletedbody]'); return b ? b.scrollHeight - b.clientHeight : -1; })()`;
ok(`  closed, the long text is cut to four lines (${await page.eval(hidden)}px hidden)`, (await page.eval(hidden)) > 4);
await press(`${goneRow} [data-deletedmore]`);
await until(`document.querySelector('${goneRow} [data-deletedmore]')?.getAttribute('aria-expanded') === 'true'`);
ok(`  Show all shows every line (${await page.eval(hidden)}px hidden)`, (await page.eval(hidden)) <= 1);
ok("  and the last line is in it",
  (await page.eval(`document.querySelector('${goneRow} [data-deletedbody]')?.innerText ?? ''`)).includes("Line 9 of"));

console.log(red ? `\n  ${red} RED` : "\n  all green");
