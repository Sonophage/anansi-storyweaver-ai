// The search panel. Three bugs found by reading the contract, reproduced here before any fix:
//   1. a result's data-hit carried the story TITLE, because db.search returns `story` (a title)
//      and `story_id` (the id), and the client read `r.storyId ?? r.story`. Clicking tried to
//      open a story called "The Silver Key" and got "no such story".
//   2. the location line read r.where / r.storyTitle, neither of which exists. Always blank.
//   3. the panel says it scans "prose, entries and summaries". It scanned passages only.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/search.js
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (l, g) => { if (!g) red++; console.log("  " + (g ? "ok  " : "RED ") + l); };
const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s=>s.title==='The Silver Key').id)()");

await page.goto(B + "/#" + sid + "/search");
await page.type('#q', 'key');
await wait(900);

const n = await page.eval("document.querySelectorAll('[data-hit]').length");
console.log("  results for 'key': " + n);
ok("the search returns something", n > 0);

// 1. the hit must carry an id, not a title
const hit = await page.eval("document.querySelector('[data-hit]')?.dataset.hit");
console.log("  first hit's data-hit: " + JSON.stringify(hit));
ok("a result carries a story id, not a title", !!hit && /^s-/.test(hit));

// 2. the location line must say something
const where = await page.eval("document.querySelector('[data-hit] .kind')?.parentElement?.textContent?.trim()");
ok(`a result says where it is (${JSON.stringify((where || '').slice(0, 40))})`, !!(where || '').replace(/^\w+\s*/, '').trim());

// 3. the panel's own claim must be true: prose, entries and summaries
const kinds = await page.eval("[...new Set([...document.querySelectorAll('[data-hit] .kind')].map(e => e.textContent.trim().toLowerCase()))].sort().join(',')");
console.log("  kinds for 'key': " + kinds);
ok("results cover entries as well as prose", kinds.includes("entry"));

// Summaries need a term that is actually in one — asserting "key" hits a summary demanded
// something the fixture cannot satisfy, which is a bad test, not a bug.
const summaryKinds = await page.eval("(async () => { const r = await (await fetch('/api/search?q=' + encodeURIComponent('debt'))).json();"
  + " return [...new Set((r.results||[]).map(x => String(x.kind).toLowerCase()))].sort().join(','); })()");
console.log("  kinds for 'debt': " + summaryKinds);
ok("  and chapter summaries are searchable", summaryKinds.includes("summary"));

// and clicking one must actually land somewhere
await page.click('[data-hit]');
await wait(900);
const err = (await page.text('#toast') || '').trim();
ok(`clicking a result does not error (${JSON.stringify(err.slice(0, 48))})`, !/no such story|cannot reach/i.test(err));
ok("  and a story is open", await page.eval("!!document.getElementById('input')"));

console.log(red ? `\n  ${red} RED` : "\n  all green");
