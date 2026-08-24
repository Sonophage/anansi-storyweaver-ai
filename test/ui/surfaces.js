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

// 2. the pill is the genre
ok("2. the card pill shows the genre", (await page.text('.storycard.hero') || '').toLowerCase().includes('noir'));

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
await page.goto(B + "/#" + sid + "/inspector");
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
ok("6. a spice override field exists", await page.eval("!!document.querySelector('[data-story=\"spiceNote\"]')"));
await page.eval("document.querySelector('[data-story=\"spiceNote\"]').value = 'Register: written by the test.'");
await page.click('[data-savestory="1"]');
await wait(700);
ok("   it saves", await page.eval("(async () => (await (await fetch('/api/story?story=" + sid + "')).json()).story.spiceNote === 'Register: written by the test.')()"));
await page.click('[data-panel=""]');
await page.click('[data-panel="inspector"]');
await page.click('[data-ctxview="prompt"]');
ok("   and it replaces the level in the prompt", (await page.text('#sideBody pre') || '').includes('written by the test'));

// 7. composer: no Discard/Keep, Regenerate on the bar
await page.goto(B + "/#" + sid);
const dock = (await page.text('#dockCol') || '');
ok("7. Discard and Keep are gone", !dock.includes('DISCARD') && !/\bKeep\b/.test(dock));
ok("   Regenerate is on the bar", await page.eval("!!document.querySelector('#bar [data-reroll]')"));

console.log(red ? `\n  ${red} RED` : "\n  all green");
