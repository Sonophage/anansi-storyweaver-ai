// The seven surface changes from bugs.md, driven in a real browser:
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/surfaces.js
// Point it at a COPY. It writes a spice override and renames nothing else.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (l, g) => { if (!g) red++;
  console.log("  " + (g ? "ok  " : "FAIL") + " " + l + (g ? "" : "   <-- broken")); };
const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s=>s.title==='The Silver Key').id)()");

// 1. hero first, then new, then the rest
await page.goto(B + "/");
ok("1. the last-written story is a hero", await page.eval("!!document.querySelector('.storycard.hero')"));
ok("   and is marked as such", (await page.text('.storycard.hero') || '').includes('Last written'));
const order = await page.eval("[...document.querySelectorAll('#page .storycard, #page .dashed')].map(e => e.className.includes('dashed') ? 'NEW' : (e.className.includes('hero') ? 'HERO' : 'story')).join(' > ')");
console.log("   order: " + order);
ok("   new story comes before the rest", order.startsWith('HERO > NEW'));

// 2. the pill is the genre — and genre is comma-separated, so it is pillS. An AI Dungeon import
// writes its whole tag list into this field, which is how a card came to read "horror, nsfw"
// inside a single pill.
ok("2. the card pill shows the genre", (await page.text('.storycard.hero') || '').toLowerCase().includes('noir'));
await page.eval("(async () => { const v = await (await fetch('/api/story?story=" + sid + "')).json();"
  + " await fetch('/api/story', { method:'POST', headers:{'Content-Type':'application/json'},"
  + " body: JSON.stringify({ id:'" + sid + "', story: { genre: 'fantasy, noir, heist' } }) }); })()");
await page.goto(B + "/");
await wait(600);
const pills = await page.eval("(() => { const card = [...document.querySelectorAll('.storycard')]"
  + ".find(c => c.textContent.includes('Silver Key'));"
  + " return card ? [...card.querySelectorAll('.tag')].map(t => t.textContent.trim()).join('|') : ''; })()");
console.log("   tag pills: " + JSON.stringify(pills));
ok(`   a comma-separated genre is one tag per pill (${JSON.stringify(pills)})`,
   pills.split('|').filter(Boolean).length >= 3 && pills.includes('fantasy') && pills.includes('heist'));
ok("   and no pill holds two of them", !pills.split('|').some((t) => t.includes(',')));
// Put it back, or every later assertion about this story's genre is reading the test's own edit.
await page.eval("(async () => { await fetch('/api/story', { method:'POST',"
  + " headers:{'Content-Type':'application/json'},"
  + " body: JSON.stringify({ id:'" + sid + "', story: { genre: 'fantasy noir' } }) }); })()");
await page.goto(B + "/");
await wait(400);

// 3. worlds: grouped by story, type filter, search across books
await page.click('[data-nav="canon"]');
await wait(900);
ok("3. entries are grouped under their story", (await page.text('#page') || '').includes('The Silver Key'));
ok("   a type filter exists", await page.eval("document.querySelectorAll('[data-lkind]').length >= 5"));
await page.click('[data-lkind="character"]');
const chars = await page.eval("document.querySelectorAll('#page [data-entry]').length");
await page.click('[data-lkind="all"]');
const all = await page.eval("document.querySelectorAll('#page [data-entry]').length");
ok("   filtering by type narrows the list (" + chars + " of " + all + ")", chars > 0 && chars < all);
await page.type('#lq', 'brass');
await wait(400);
const hits = await page.eval("document.querySelectorAll('#page [data-entry]').length");
ok("   search narrows it too (" + hits + " for 'brass')", hits > 0 && hits < all);

// 4. context: a readable prompt, and rows that jump
await page.goto(B + "/#" + sid + "/context");
ok("4. the Context panel offers a prompt view", await page.eval("!!document.querySelector('[data-ctxview=\"prompt\"]')"));
await page.click('[data-ctxview="prompt"]');
const promptLen = await page.eval("(document.querySelector('#sideBody pre')?.textContent || '').length");
ok("   the prompt actually sent is readable (" + promptLen + " chars)", promptLen > 400);
ok("   and it is the real thing", (await page.text('#sideBody pre') || '').includes('prose engine'));
await page.click('[data-ctxview="blocks"]');
await page.click('[data-goblock^="entry"]');
ok("   clicking a canon row opens that entry", await page.eval("!!document.querySelector('[data-f=\"body\"]')"));

// 5 + 6. dropdowns fed from the ledger, and the spice override
await page.goto(B + "/#" + sid + "/story");
ok("5. Setting is a dropdown", await page.eval("document.querySelector('[data-story=\"setting\"]')?.tagName === 'SELECT'"));
ok("   Point of view is a dropdown", await page.eval("document.querySelector('[data-story=\"pov\"]')?.tagName === 'SELECT'"));
ok("   You are is a dropdown", await page.eval("document.querySelector('[data-story=\"persona\"]')?.tagName === 'SELECT'"));
ok("   the cast fills You are", await page.eval("[...document.querySelector('[data-story=\"persona\"]').options].some(o => o.text.includes('Aldis'))"));
ok("   the ledger fills Setting", await page.eval("[...document.querySelector('[data-story=\"setting\"]').options].length > 1"));
// 6. Spice is a level OR a written register, never both, and the sixth option is the switch.
// The written box used to sit on screen always, which made it noise on every story that does
// not use one.
const spiceOpts = await page.eval("[...document.querySelectorAll('[data-story=\"spice\"] option')].map(o => o.value).join(',')");
console.log("   spice options: " + spiceOpts);
ok("6. spice offers a custom option alongside the levels", spiceOpts.endsWith(',custom'));
ok("   and the written box is hidden until it is chosen",
   await page.eval("document.getElementById('spiceCustom')?.hidden === true"));
await page.eval("(() => { const el = document.querySelector('[data-story=\"spice\"]');"
  + " el.value = 'custom'; el.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()");
await wait(400);
ok("   choosing custom reveals it", await page.eval("document.getElementById('spiceCustom')?.hidden === false"));
await page.eval("document.querySelector('[data-story=\"spiceNote\"]').value = 'Register: written by the test.'");
await page.click('[data-savestory="1"]');
await wait(900);
ok("   it saves", await page.eval("(async () => (await (await fetch('/api/story?story=" + sid + "')).json()).story.spiceNote === 'Register: written by the test.')()"));
await page.click('[data-panel=""]');
await page.click('[data-panel="context"]');
await page.click('[data-ctxview="prompt"]');
ok("   and it replaces the level in the prompt", (await page.text('#sideBody pre') || '').includes('written by the test'));

// Going back to a level must CLEAR the written line, or it goes on silently overriding the
// level the writer just picked — which is the whole reason the two cannot both be on screen.
await page.click('[data-nav="story"]');
await wait(500);
ok("   and reopening shows custom still selected",
   await page.eval("document.querySelector('[data-story=\"spice\"]')?.value === 'custom'"));
await page.eval("(() => { const el = document.querySelector('[data-story=\"spice\"]');"
  + " el.value = '2'; el.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()");
await wait(300);
await page.click('[data-savestory="1"]');
await wait(900);
const back = await page.eval("(async () => { const v = await (await fetch('/api/story?story=" + sid + "')).json();"
  + " return JSON.stringify({ spice: v.story.spice, note: v.story.spiceNote }); })()");
console.log("   after choosing a level again: " + back);
ok("   picking a level clears the written register", !JSON.parse(back).note);
ok("   and the level is what was picked", Number(JSON.parse(back).spice) === 2);

// 7. composer: no Discard/Keep, Regenerate on the bar
await page.goto(B + "/#" + sid);
const dock = (await page.text('#dockCol') || '');
ok("7. Discard and Keep are gone", !dock.includes('DISCARD') && !/\bKeep\b/.test(dock));
ok("   Regenerate is on the bar", await page.eval("!!document.querySelector('#bar [data-reroll]')"));

console.log(red ? `\n  ${red} RED` : "\n  all green");
