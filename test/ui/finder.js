// needs: fake-featherless
// Find a model: open it from the rail's model menu, search the catalogue, add a model to the
// shortlist, and remove it again. Runs against the fake Featherless that test/ui/run.sh starts for
// a scenario whose first line asks for one, so it is fast and spends nothing.
//
//   test/ui/run.sh finder
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (l, g) => { if (!g) red++; console.log("  " + (g ? "ok  " : "RED ") + l); };
const until = async (expr, n = 40) => {
  for (let i = 0; i < n; i++) { if (await page.eval(expr)) return true; await wait(250); }
  return false;
};
const QWEN = "featherless:llmfan46/Qwen3.6-35B-A3B-uncensored-heretic";
const hits = () => page.eval("[...document.querySelectorAll('#findhits [title]')].map(e => e.title)");
const mine = () => page.eval("(async () => (await (await fetch('/api/shortlist')).json()).models)()");
/** Set the search box the way typing does: the value, then the input event the app listens for. */
const search = async (q) => {
  await page.eval(`(() => { const e = document.getElementById('findq'); e.value = ${JSON.stringify(q)};
    e.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
  await wait(700);
};

// ---- 1. the door: the last row of the rail's model menu
await page.goto(B + "/");
await page.click('[data-modelmenu="1"]');
ok("the model menu has a Find a model row", await until("!!document.querySelector('[data-findmodel]')"));
ok("and it is the last thing in the list, after every model", await page.eval(`(() => {
  const f = document.querySelector('[data-findmodel]'), rows = [...document.querySelectorAll('[data-modelinfo]')];
  return rows.every((r) => r.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING); })()`));

// ---- 2. the sheet: the shortlist on top, uncensored results below
await page.click('[data-findmodel]');
ok("the sheet opens with results", await until("document.querySelectorAll('[data-addshort]').length > 0"));
ok("the shortlist sits above the search", await page.eval(`!!(document.getElementById('findmine')
  .compareDocumentPosition(document.getElementById('findq')) & Node.DOCUMENT_POSITION_FOLLOWING)`));
let ids = await hits();
ok("uncensored only, by default", ids.length === 3 && !ids.some((i) => i.includes("Gemma-4-26B-it")));
ok("a model under the context floor is never shown", !ids.some((i) => i.includes("Tiny-Ctx")));
ok("the ones that never weave come first", ids[0].includes("Mistral-Small"));

// ---- 3. searching, and the uncensored switch
await search("gpt");
ids = await hits();
ok(`free text narrows it (${ids.length})`, ids.length === 1 && ids[0].includes("gpt-oss"));
const row = await page.eval("document.querySelector('#findhits [title]')?.parentElement?.textContent ?? ''");
ok("a row says its unit cost, its context and whether it weaves",
  /1 unit/.test(row) && /32,768 context/.test(row) && /always weaves/.test(row));
ok("and never says thinking", !/think/i.test(await page.eval("document.getElementById('sideBody').textContent")));
await search("");
await page.click('[data-finduncensored]');
await wait(700);
ok("turning uncensored-only off shows a stock model", (await hits()).some((i) => i.includes("Gemma-4-26B-it")));
await page.pick('[data-findweave]', 'always weaves');
await wait(700);
ids = await hits();
ok(`the weaving filter narrows it (${ids.length})`, ids.length === 1 && ids[0].includes("gpt-oss"));
await page.pick('[data-findweave]', '');
await wait(700);

// ---- 4. add: one press, onto the shortlist and the menu
await page.click(`[data-addshort="${QWEN}"]`);
ok("adding puts it on the shortlist at the top of the sheet",
  await until(`!!document.querySelector('#findmine [data-dropshort="${QWEN}"]')`));
const got = (await mine()).find((m) => m.id === QWEN);
ok(`the shortlist keeps its weaving and its cost (${got?.weaving}, ${got?.cost})`,
  got?.weaving === "can switch" && got?.cost === 2);
ok("the result row says it is on your shortlist", await page.eval(`!document.querySelector('[data-addshort="${QWEN}"]')`));
await page.click('[data-modelmenu="1"]');
ok("it appears on the writer's model menu", await until(`!!document.querySelector('#rail [data-modelinfo="${QWEN}"]')`));
ok("and the menu has no remove — remove lives in the sheet", await page.eval("!document.querySelector('#rail [data-dropshort]')"));

// ---- 5. remove, from the sheet
await page.click('[data-findmodel]');
await until(`!!document.querySelector('#findmine [data-dropshort="${QWEN}"]')`);
await page.click(`[data-dropshort="${QWEN}"]`);
ok("remove takes it off the sheet", await until(`!document.querySelector('[data-dropshort="${QWEN}"]')`));
ok("and off the shortlist", (await mine()).length === 0);

console.log(red ? `\n  ${red} RED` : "\n  all green");
