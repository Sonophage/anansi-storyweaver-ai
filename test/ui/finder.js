// needs: fake-featherless
// Find a model, which is Storyteller's Shortlist tab since #131: open it from the model named in
// the menu, search the catalogue, see each row's tags,
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
// The name's title, inside the row's button: the where-it-runs mark beside it has a title too.
const hits = () => page.eval("[...document.querySelectorAll('#findhits [data-findmore] [title]')].map(e => e.title)");
/** Every row in `list` has its where-it-runs mark, and it is the first thing on the left. */
const marksLeft = (list) => page.eval(`(() => { const r = [...document.querySelectorAll('#${list} [data-findmore]')];
  return r.length > 0 && r.every((b) => b.parentElement.firstElementChild.matches('[data-runs]')); })()`);
const mine = () => page.eval("(async () => (await (await fetch('/api/shortlist')).json()).models)()");
/** Set the search box the way typing does: the value, then the input event the app listens for. */
const search = async (q) => {
  await page.eval(`(() => { const e = document.getElementById('findq'); e.value = ${JSON.stringify(q)};
    e.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
  await wait(700);
};

// ---- 1. the door: the model named in the menu opens Storyteller, and the ＋ in its header opens
// its Add a model tab (Seth, 2026-11-03: Shortlist and Add a model are two tabs, and "The add button
// can go up top by the close and expand button").
await page.goto(B + "/");
await page.click('[data-modelmenu="1"]');
ok("the model name opens Storyteller, with an Add a model tab", await until("!!document.querySelector('#sideBody [data-tellertab=\"addmodel\"]')"));
await page.click('#sideHead [data-findmodel="1"]');

// ---- 2. the sheet: uncensored results, and the shortlist on a tab of its own
ok("the ＋ opens Add a model", await page.eval("document.querySelector('[data-tellertab=\"addmodel\"]')?.getAttribute('aria-pressed') === 'true'"));
ok("the sheet opens with results", await until("document.querySelectorAll('[data-addshort]').length > 0"));
ok("the shortlist is not on this tab", await page.eval("!document.getElementById('findmine')"));
let ids = await hits();
ok("uncensored only, by default", ids.length === 3 && !ids.some((i) => i.includes("Gemma-4-26B-it")));
ok("a model under the context floor is never shown", !ids.some((i) => i.includes("Tiny-Ctx")));
ok("the ones that never weave come first", ids[0].includes("Mistral-Small"));

// ---- 3. searching, and the uncensored switch
await search("gpt");
ids = await hits();
ok(`free text narrows it (${ids.length})`, ids.length === 1 && ids[0].includes("gpt-oss"));
const row = await page.eval("document.querySelector('#findhits [data-findmore] [title]')?.parentElement?.textContent ?? ''");
ok("each result carries its where-it-runs mark, on the left", await marksLeft('findhits'));
ok("a row says its unit cost, its size and whether it spins",
  /1 unit/.test(row) && /32,768 tokens/.test(row) && /always plans/.test(row));
ok("and never says thinking", !/think/i.test(await page.eval("document.getElementById('sideBody').textContent")));
await search("");
await page.click('[data-finduncensored]');
await wait(700);
ok("turning uncensored-only off shows a stock model", (await hits()).some((i) => i.includes("Gemma-4-26B-it")));
ids = await hits();
const untried = await page.eval("document.querySelector('#findhits [data-findmore] [title$=\"Step-3.5-Flash\"]')?.parentElement?.textContent ?? ''");
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

// ---- 3c. units and tags. Seth, 2026-10-25: "a filter for how many units it takes and a tag search
// of any listed tags or the option to click a tag and find others like it."
const all = (await hits()).length;
await page.pick('[data-findcost]', '1');
await wait(700);
const ones = await page.eval(`[...document.querySelectorAll('#findhits [data-findmore]')].map((b) => b.textContent)`);
ok(`the units filter narrows to 1-unit models (${ones.length} of ${all})`,
   ones.length > 0 && ones.length < all && ones.every((t) => /\b1 unit\b/.test(t)));
await page.pick('[data-findcost]', '');
await wait(700);
await until(`[...document.querySelectorAll('#findhits [data-findmore]')].every((b) => b.querySelector('.hubtags'))`);
// A press on a tag: the other rows carrying it, and only them.
await page.eval(`(() => { document.querySelector('[data-findmore="${QWEN}"] [data-findtag="roleplay"]').click(); return 1; })()`);
await wait(300);
const tagged = await page.eval(`[...document.querySelectorAll('#findhits [data-findmore]')].map((b) => b.dataset.findmore)`);
ok(`a press on a tag shows the models that carry it (${JSON.stringify(tagged)})`,
   tagged.some((id) => id.includes('Qwen3.6')) && tagged.length < all
   && !tagged.some((id) => id.includes('Mistral-Small')));
ok("  and puts the tag in the tag box", (await page.eval("document.getElementById('findtag')?.value")) === 'roleplay');
// Typed: the same filter, from the box.
await page.eval("(() => { const t = document.getElementById('findtag'); t.value = 'adventure'; t.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()");
await wait(300);
const typed = await page.eval(`[...document.querySelectorAll('#findhits [data-findmore]')].map((b) => b.dataset.findmore)`);
ok(`a typed tag filters the rows (${JSON.stringify(typed)})`, typed.some((id) => id.includes('Mistral-Small')) && !typed.some((id) => id.includes('Qwen3.6')));
await page.eval("(() => { document.querySelector('#findhits [data-findtag=\"\"]').click(); return 1; })()");
await wait(300);
ok("  and Clear brings every row back", (await hits()).length === all);

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
ok("adding puts it on the shortlist", await until(`!document.querySelector('[data-addshort="${QWEN}"]')`));
await page.click('[data-tellertab="shortlist"]');
ok("and the Shortlist tab lists it",
  await until(`!!document.querySelector('#findmine [data-dropshort="${QWEN}"]')`));
const got = (await mine()).find((m) => m.id === QWEN);
ok(`the shortlist keeps its weaving and its cost (${got?.weaving}, ${got?.cost})`,
  got?.weaving === "can switch" && got?.cost === 2);
// Model is a tale's tab (2026-11-03), so the list is read in a tale.
const tale = (await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories)()"))[0].id;
await page.goto(B + "/#" + tale + "/teller");
await until("!!document.querySelector('[data-tellertab=\"model\"]')");
await page.click('[data-tellertab="model"]');
await until("!!document.querySelector('[data-tellerlist=\"tale\"]')");
if (await page.eval("document.querySelector('[data-tellerlist=\"tale\"]').getAttribute('aria-expanded') !== 'true'"))
  await page.click('[data-tellerlist="tale"]');
ok("it appears in the tale's model list on Model", await until(`!!document.querySelector('#talemodels [data-talemodel="${QWEN}"]')`));
ok("and the list has no remove — remove lives on Shortlist", await page.eval("!document.querySelector('#talemodels [data-dropshort]')"));
await page.click('[data-tellerlist="tale"]');

// ---- 4b. the Shortlist row describes a remote model with the same block
await page.click('[data-tellertab="shortlist"]');
await until(`!!document.querySelector('#findmine [data-findmore="${QWEN}"]')`);
ok("each shortlist row carries the same mark, on the left", await marksLeft('findmine'));
await page.click(`#findmine [data-findmore="${QWEN}"]`);
ok("the shortlist row for a remote model opens its card",
  await until(`/abliterated finetune/.test(document.querySelector('#findmine .remoteabout')?.innerText ?? '')`));
text = await about('#findmine');
ok("with the base model and the tags, as plain text",
  /Qwen\/Qwen3\.6-35B-A3B/.test(text) && /roleplay/.test(text) && !/[<>{}]/.test(text));
ok("drawn by the same renderer as the search's expanded row: the same block, to the character",
  sheetBlock !== '' && await page.eval("document.querySelector('#findmine .remoteabout')?.innerHTML ?? ''") === sheetBlock);

// ---- 5. remove, from the Shortlist tab
await page.click('[data-tellertab="shortlist"]');
await until(`!!document.querySelector('#findmine [data-dropshort="${QWEN}"]')`);
await page.click(`[data-dropshort="${QWEN}"]`);
ok("remove takes it off the sheet", await until(`!document.querySelector('[data-dropshort="${QWEN}"]')`));
ok("and off the shortlist", (await mine()).length === 0);

console.log(red ? `\n  ${red} RED` : "\n  all green");
