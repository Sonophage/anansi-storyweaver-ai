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
ok("results cover threads as well as prose", kinds.includes("thread"));

// Summaries need a term that is actually in one — asserting "key" hits a summary demanded
// something the fixture cannot satisfy, which is a bad test, not a bug. 'debt' was the second
// version of that same mistake: it is in an entry body and in the story's direction, never in
// a summary, so it proved the entry branch twice. 'waterline' appears in chapter two's summary
// and nowhere else, which is the only kind of term that can prove this union branch at all.
const summaryKinds = await page.eval("(async () => { const r = await (await fetch('/api/search?q=' + encodeURIComponent('waterline'))).json();"
  + " return [...new Set((r.results||[]).map(x => String(x.kind).toLowerCase()))].sort().join(','); })()");
console.log("  kinds for 'waterline': " + summaryKinds);
ok("  and chapter summaries are searchable", summaryKinds.includes("summary"));

// ---- clicking a result must land ON the thing, not merely in the story it lives in.
// Every hit used to do the same thing — open the story — so finding the passage was the
// reader's job all over again.
await page.eval("(() => { document.getElementById('q').value = ''; return 1; })()");
await page.type('#q', 'rain');
await wait(1400);
const hits = await page.eval("[...document.querySelectorAll('[data-hit]')].map(b =>"
  + " b.dataset.hitkind + ':' + b.dataset.hitid).join('|')");
console.log("  hits carry: " + hits.slice(0, 120));
ok("a result knows what it points at, not just which story", /Prose:p-|Entry:e-|Summary:/.test(hits));

// Prose: it should scroll to that passage and mark it.
const prose = await page.eval("[...document.querySelectorAll('[data-hit]')]"
  + ".find(b => b.dataset.hitkind === 'Prose')?.dataset.hitid ?? ''");
if (prose) {
  await page.click(`[data-hit][data-hitid="${prose}"]`);
  await wait(1400);
  const err = (await page.text('#toast') || '').trim();
  ok(`clicking a prose hit does not error (${JSON.stringify(err.slice(0, 44))})`,
     !/no such story|no such tale|cannot reach|not answering|another branch/i.test(err));
  ok("  and a story is open", await page.eval("!!document.getElementById('input')"));
  ok("  and exactly that passage is marked",
     (await page.eval("document.querySelectorAll('.block.found').length")) === 1);
  ok("  the marked one is the one that was clicked",
     await page.eval(`!!document.querySelector('.block.found [data-edit="${prose}"]')`));
  // The mark is temporary on purpose: a permanent highlight on the last thing you searched for
  // stops being information.
  ok("  and the panel got out of the way so you can see it",
     await page.eval("document.getElementById('side')?.hidden !== false"));
} else { ok("a prose hit exists to click", false); }

// Entry: it should open that entry's editor, not just the story.
await page.goto(B + "/#" + sid + "/search");
await page.type('#q', 'brass');
await wait(1400);
const entry = await page.eval("[...document.querySelectorAll('[data-hit]')]"
  + ".find(b => b.dataset.hitkind === 'Entry')?.dataset.hitid ?? ''");
if (entry) {
  await page.click(`[data-hit][data-hitid="${entry}"]`);
  await wait(1200);
  // A card opens on its FACE now (PLAN-08). This section is about the form, so it presses Edit —
// the assertions below are unchanged and still measure what they always did.
await page.eval("(() => { document.querySelector('[data-cardview=\"form\"]')?.click(); return 1; })()");
await wait(500);
ok("clicking an entry hit opens that entry's editor",
     await page.eval("!!document.querySelector('[data-f=\"title\"]')"));
  ok("  and it is the entry that was clicked",
     (await page.eval("(async () => { const v = await (await fetch('/api/story?story=" + sid + "')).json();"
       + " const el = document.querySelector('[data-f=\"title\"]');"
       + " return v.entries.find(e => e.id === '" + entry + "')?.title === el?.value; })()")) === true);
} else { console.log("  SKIP entry hit — nothing matched 'brass' in the ledger"); }

// ---- add to the lore book, straight off a result
await page.goto(B + "/#" + sid + "/search");
await page.type('#q', 'rain');
await wait(1400);
// Search spans every story this writer owns, so the first hit is not necessarily in this one —
// and the entry lands in the ledger of whichever story the hit belongs to, which is right. Pick
// the button whose hit IS this story, or the count below is taken on the wrong ledger.
const mine = await page.eval("(() => { const rows = [...document.querySelectorAll('[data-tolore]')];"
  + " const at = rows.findIndex(b => b.parentElement.querySelector('[data-hit]')?.dataset.hit === '" + sid + "');"
  + " return at < 0 ? '' : rows[at].dataset.tolore; })()");
console.log("  tolore index for this story: " + JSON.stringify(mine));
const nBefore = await page.eval("(async () => (await (await fetch('/api/story?story=" + sid + "')).json()).entries.length)()");
if (mine !== '') {
  await page.click(`[data-tolore="${mine}"]`);
  await wait(1600);
  const v = await page.eval("(async () => await (await fetch('/api/story?story=" + sid + "')).json())()");
  ok(`Add to threads writes an entry (${nBefore} -> ${v.entries.length})`, v.entries.length === nBefore + 1);
  const made = v.entries.at(-1);
  ok(`  named from the text (${JSON.stringify((made?.title ?? '').slice(0, 34))})`, (made?.title ?? '').length > 3);
  // Deliberate: an always-on entry made from a highlight would cost tokens on every call from
  // now on, before anyone had looked at it.
  ok(`  and it does not fire until you give it trigger words (${made?.activation})`,
     made?.activation === 'triggered' && (made?.keys ?? []).length === 0);
  // A NEW CARD OPENS ON ITS FORM, not its face (PLAN-08). It is born with no trigger words and
  // cannot fire until somebody types some, so landing on a view that prints only what is filled in
  // would show nothing at all beside a toast asking for words there is no box for.
  ok("  and it opens the FORM so it gets finished, not the face",
     await page.eval("!!document.querySelector('[data-f=\"keys\"]')"));
  ok("  and says what is still needed", /wake words/i.test(await page.text('#toast') || ''));
} else { ok("a result in this story offers Add to threads", false); }

console.log(red ? `\n  ${red} RED` : "\n  all green");
