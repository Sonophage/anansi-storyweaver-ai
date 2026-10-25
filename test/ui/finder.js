// needs: fake-featherless
// Find a model: open it from the rail's model menu, search the catalogue, see each row's tags,
// expand a row for its base model and card, add a model to the shortlist, read the same card on
// the model info panel, and remove it again. Runs against the fake Featherless that test/ui/run.sh starts for
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
ok("a row says its unit cost, its size and whether it spins",
  /1 unit/.test(row) && /32,768 tokens/.test(row) && /always plans/.test(row));
ok("and never says thinking", !/think/i.test(await page.eval("document.getElementById('sideBody').textContent")));
await search("");
await page.click('[data-finduncensored]');
await wait(700);
ok("turning uncensored-only off shows a stock model", (await hits()).some((i) => i.includes("Gemma-4-26B-it")));
ids = await hits();
const untried = await page.eval("document.querySelector('#findhits [title$=\"Step-3.5-Flash\"]')?.parentElement?.textContent ?? ''");
ok(`a family Anansi has not met says not tried yet, last (${JSON.stringify(untried.trim().slice(-40))})`,
  /not tried yet/.test(untried) && !/never plans/.test(untried) && ids.at(-1).includes("Step-3.5-Flash"));
ok("and the weaving filter offers it", await page.eval(`[...document.querySelectorAll('[data-findweave] option')]
  .some((o) => o.value === 'not tried yet')`));
await page.pick('[data-findweave]', 'always weaves');
await wait(700);
ids = await hits();
ok(`the weaving filter narrows it (${ids.length})`, ids.length === 1 && ids[0].includes("gpt-oss"));
await page.pick('[data-findweave]', '');
await wait(700);

// ---- 3b. tags in every row, and expanding a row for the base model and the card's first paragraph
const MISTRAL = "featherless:TheDrummer/Mistral-Small-Uncensored-24B";
const rowsAndTags = () => page.eval(`[document.querySelectorAll('#findhits [data-findmore]').length,
  document.querySelectorAll('#findhits [data-findmore] .hubtags').length]`);
ok("every result row shows its Hugging Face tags",
  await until(`(() => { const r = document.querySelectorAll('#findhits [data-findmore]');
    return r.length > 0 && [...r].every((b) => b.querySelector('.hubtags')); })()`));
console.log(`      (${(await rowsAndTags()).join(' rows, ')} with tags)`);
ok("a row's tags are the author's own words", /roleplay/.test(await page.eval(
  `document.querySelector('[data-findmore="${QWEN}"] .hubtags')?.textContent ?? ''`)));
const about = (scope) => page.eval(`document.querySelector('${scope} .remoteabout')?.innerText ?? ''`);
await page.click(`[data-findmore="${QWEN}"]`);
ok("expanding a row reads its card", await until(`/abliterated finetune/.test(document.querySelector('#findhits .remoteabout')?.innerText ?? '')`));
let text = await about('#findhits');
ok("and shows the base model", /Qwen\/Qwen3\.6-35B-A3B/.test(text));
ok("the card's first paragraph is plain text, its banner stripped",
  /long-form fiction & roleplay/.test(text) && !/[<>{}]|banner|gradient|img|QWEN HERETIC/.test(text));
const sheetBlock = await page.eval("document.querySelector('#findhits .remoteabout')?.innerHTML ?? ''");
await page.click(`[data-findmore="${MISTRAL}"]`);
ok("a card with no paragraph", await until(`(document.querySelector('#findhits .remoteabout')?.innerText ?? '').includes('mistralai')`));
text = await about('#findhits');
ok("shows the base model and the tags only, and never raw markup",
  /adventure/.test(text) && !/[<>{}]|style|img|kofi/i.test(text) && !/qwen/i.test(text));
await page.click(`[data-findmore="${MISTRAL}"]`);
ok("pressing it again folds it", await until("!document.querySelector('#findhits .remoteabout')"));

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

// ---- 4b. the model info panel describes a remote model with the same block
await page.click(`#rail [data-modelinfo="${QWEN}"]`);
ok("the model info panel for a remote model shows its card",
  await until(`/abliterated finetune/.test(document.querySelector('#sideBody .remoteabout')?.innerText ?? '')`));
text = await about('#sideBody');
ok("with the base model and the tags, as plain text",
  /Qwen\/Qwen3\.6-35B-A3B/.test(text) && /roleplay/.test(text) && !/[<>{}]/.test(text));
ok("drawn by the same renderer as the expanded row: the same block, to the character",
  sheetBlock !== '' && await page.eval("document.querySelector('#sideBody .remoteabout')?.innerHTML ?? ''") === sheetBlock);
ok("and not the hint for a local model with nothing written down",
  !/Nothing is written down about this one/.test(await page.eval("document.getElementById('sideBody').innerText")));

// ---- 5. remove, from the sheet, reached again through the menu the info panel closed
await page.click('[data-modelmenu="1"]');
await until("!!document.querySelector('[data-findmodel]')");
await page.click('[data-findmodel]');
await until(`!!document.querySelector('#findmine [data-dropshort="${QWEN}"]')`);
await page.click(`[data-dropshort="${QWEN}"]`);
ok("remove takes it off the sheet", await until(`!document.querySelector('[data-dropshort="${QWEN}"]')`));
ok("and off the shortlist", (await mine()).length === 0);

console.log(red ? `\n  ${red} RED` : "\n  all green");
