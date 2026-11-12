// Recently deleted (#169): Account's fifth tab. With nothing deleted it says so plainly; after one
// version of a passage with two is deleted from the passage's own actions, it lists that version
// with its text, its tale, its scene and when.
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

console.log(red ? `\n  ${red} RED` : "\n  all green");
