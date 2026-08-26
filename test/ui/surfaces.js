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
// Waited for, not assumed. This asserted and clicked straight after the navigation, which held
// while the first paint was cheap and started dying in a batch of four once the chapter band, the
// running head and nine themes' worth of custom properties joined it.
for (let i = 0; i < 40 && !(await page.eval("!!document.querySelector('[data-ctxview=\"prompt\"]')")); i++) await wait(150);
ok("4. the Context panel offers a prompt view", await page.eval("!!document.querySelector('[data-ctxview=\"prompt\"]')"));
await page.click('[data-ctxview="prompt"]');
for (let i = 0; i < 40 && !(await page.eval("!!document.querySelector('#sideBody pre')")); i++) await wait(150);
const promptLen = await page.eval("(document.querySelector('#sideBody pre')?.textContent || '').length");
ok("   the prompt actually sent is readable (" + promptLen + " chars)", promptLen > 400);
ok("   and it is the real thing", (await page.text('#sideBody pre') || '').includes('prose engine'));
await page.click('[data-ctxview="blocks"]');
// A row is a door and it now says what is behind it. It used to say CANON-ALWAYS and open a panel
// headed Threads, which is how you click a row and arrive lost. Several entries make one block, so
// the row opens the list; a block from a single entry still opens that entry.
const rows = "[...document.querySelectorAll('#sideBody [data-goblock]')]";
ok("   no row is labelled in the engine's words",
   await page.eval(rows + ".every(r => !/CANON-|SPINE|EARLIER/.test(r.textContent))"));
const canon = await page.eval("(() => { const r = " + rows
  + ".find(x => /Threads,/.test(x.textContent)); return r ? r.dataset.goblock : null; })()");
ok("   the canon row is named for where it goes (" + canon + ")",
   canon === 'threads:' || /^entry:/.test(canon || ''));
await page.eval("(() => { " + rows + ".find(x => /Threads,/.test(x.textContent)).click(); return 1; })()");
await wait(400);
ok("   and clicking it lands on something that says the same word",
   /Threads/.test(await page.text('#sideHead') || '')
   || !!(await page.eval("!!document.querySelector('[data-f=\"body\"]')")));

// 5 + 6. dropdowns fed from the ledger, and the spice override
await page.goto(B + "/#" + sid + "/story");
ok("5. Setting is a dropdown", await page.eval("document.querySelector('[data-story=\"setting\"]')?.tagName === 'SELECT'"));
ok("   Point of view is a dropdown", await page.eval("document.querySelector('[data-story=\"pov\"]')?.tagName === 'SELECT'"));
ok("   You are is a dropdown", await page.eval("document.querySelector('[data-story=\"persona\"]')?.tagName === 'SELECT'"));
ok("   the cast fills You are", await page.eval("[...document.querySelector('[data-story=\"persona\"]').options].some(o => o.text.includes('Aldis'))"));
ok("   the ledger fills Setting", await page.eval("[...document.querySelector('[data-story=\"setting\"]').options].length > 1"));
// The lockout: a second, separate dropdown from "You are", so handing yourself a different
// character for a scene does not also hand over the one you were keeping.
ok("   the model-never-writes lock is its own dropdown",
   await page.eval("document.querySelector('[data-story=\"lockedCharacter\"]')?.tagName === 'SELECT'"));
ok("   drawn from the cast, and off by default",
   await page.eval("(() => { const el = document.querySelector('[data-story=\"lockedCharacter\"]');"
     + " return el.value === '' && [...el.options].some(o => o.text.includes('Aldis')); })()"));
await page.eval("(() => { const el = document.querySelector('[data-story=\"lockedCharacter\"]');"
  + " el.value = [...el.options].find(o => o.text.includes('Aldis')).value; return 1; })()");
await page.click('[data-savestory="1"]');
await wait(800);
const locked = await page.eval("(async () => (await (await fetch('/api/story?story=" + sid + "')).json()).story.lockedCharacter)()");
ok(`   and saving it sticks (${JSON.stringify(locked)})`, /Aldis/.test(locked || ''));
// The whole point: it reaches the prompt.
const lockPrompt = await page.eval("(async () => { const r = await (await fetch('/api/manifest',{method:'POST',"
  + "headers:{'Content-Type':'application/json'},body:JSON.stringify({storyId:'" + sid + "',mode:'continue'})})).json();"
  + " return r.prompt; })()");
ok("   and reaches the prompt as a standing instruction",
   /belongs to the writer/.test(lockPrompt) && /Stop where/.test(lockPrompt));
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

// ---- 8. every theme has to be readable, in the chrome as well as the document. Until the raw
// hexes came out of web/app.js the panel and the rail could not be themed at all — 162 of them,
// all dark-theme values — so a light theme was only ever half applied. This is the check that the
// token contract holds, and it caught parchment's gold at 3.1:1 on paper.
const lum = (c) => { const m = (c.match(/[\d.]+/g) || [0, 0, 0]).map(Number);
  const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
  return .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]); };
await page.goto(B + "/#" + sid);
for (let i = 0; i < 40 && !(await page.visible('#modes')); i++) await wait(250);
for (const theme of ['obsidian', 'ink', 'parchment']) {
  await page.eval(`(() => { document.documentElement.dataset.uiTheme = '${theme}'; return 1; })()`);
  await wait(350);
  const rows = JSON.parse(await page.eval(`(() => {
    const out = [];
    for (const sel of ['#col .narr', '#sideBody', '#bar .serif', '#modes button', '#modes button[data-mode]',
                       '.hint', '#input']) {
      const el = document.querySelector(sel); if (!el) continue;
      let bg = 'rgba(0, 0, 0, 0)', n = el;
      while (n && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) { bg = getComputedStyle(n).backgroundColor; n = n.parentElement; }
      out.push([sel, getComputedStyle(el).color, bg]);
    }
    return JSON.stringify(out); })()`));
  let worst = 99, where = '';
  for (const [sel, fg, bg] of rows) {
    const r = (Math.max(lum(fg), lum(bg)) + .05) / (Math.min(lum(fg), lum(bg)) + .05);
    if (r < worst) { worst = r; where = sel; }
  }
  ok(`8. ${theme} is readable — worst ${worst.toFixed(1)}:1 on ${where}`, worst >= 4.5);
}
await page.eval("(() => { document.documentElement.dataset.uiTheme = 'obsidian'; return 1; })()");

// The motion system has to actually apply, not merely be declared.
await page.goto(B + "/#" + sid + "/threads");
await wait(700);
const motion = JSON.parse(await page.eval(`(() => {
  const cs = getComputedStyle(document.documentElement);
  const newest = document.querySelector('#col .block.newest');
  const card = document.querySelector('#sideBody .card, #sideBody .row');
  return JSON.stringify({
    tokens: ['--ease','--ease-out','--t-fast','--t','--t-slow','--t-page'].map(k => cs.getPropertyValue(k).trim()),
    newest: newest ? getComputedStyle(newest).animationName : 'MISSING',
    card: card ? getComputedStyle(card).animationName : 'MISSING',
    moving: [...document.querySelectorAll('#col .block')].filter(b => getComputedStyle(b).animationName !== 'none').length,
  }); })()`));
ok("   every motion token resolves", motion.tokens.every((t) => t.length));
ok(`   the newest passage rises (${motion.newest})`, motion.newest === 'rise');
ok(`   panel contents animate (${motion.card})`, motion.card !== 'none' && motion.card !== 'MISSING');
// Only the newest — replaying the whole document on every repaint would be a slot machine, and
// `:last-of-type` silently matched nothing because the chapter pager is a div that comes after.
ok(`   and only the newest one (${motion.moving})`, motion.moving === 1);

// ---- the Aa menu: three tabs, and swatches you can tell apart
// Nine themes in one column with six near-black circles was a list nobody could read. Theme, Font
// and Size are separate now, and a swatch carries the accent as well as the paper.
await page.goto(B + "/#" + sid);
await wait(800);
await page.eval("(() => { document.querySelector('[data-appearance=\"1\"]')?.click(); return 1; })()");
await wait(400);
const tabs = await page.eval("[...document.querySelectorAll('[data-looktab]')].map(b => b.dataset.looktab).join(',')");
ok(`the Aa menu splits into tabs (${tabs})`, tabs === 'theme,font,size,scale');
ok("  showing the themes first", (await page.eval("document.querySelectorAll('[data-theme]').length")) === 9);
ok("  and only the themes — not the fonts and sizes as well",
   (await page.eval("document.querySelectorAll('[data-fontpick]').length")) === 0
   && (await page.eval("document.querySelectorAll('[data-sizepick]').length")) === 0);
// Every swatch shows its own accent, so six near-black papers are still nine distinguishable
// circles. Asserted on the RENDERED gradients being distinct rather than on any one colour.
const swatches = await page.eval("(() => [...document.querySelectorAll('[data-theme] span:first-child')]"
  + ".map(s => getComputedStyle(s).backgroundImage))()");
ok(`  each theme's swatch carries its accent (${new Set(swatches).size} distinct of ${swatches.length})`,
   new Set(swatches).size === swatches.length);
await page.eval("(() => { document.querySelector('[data-looktab=\"font\"]').click(); return 1; })()");
await wait(300);
ok("  switching to Font shows the six fonts and hides the themes",
   (await page.eval("document.querySelectorAll('[data-fontpick]').length")) === 6
   && (await page.eval("document.querySelectorAll('[data-theme]').length")) === 0);
// Four of the six are system stacks, which is the whole reason there can be six: the two web faces
// are the only network this page touches, and the list must not have deepened that.
ok("  and the four added ones are system faces, not new downloads",
   (await page.eval("(() => { const want = ['book','garamond','system','mono'];"
     + " return want.every(k => document.querySelector(`[data-fontpick=\"${k}\"]`)); })()")) === true);
await page.eval("(() => { document.querySelector('[data-looktab=\"size\"]').click(); return 1; })()");
await wait(300);
ok("  and Size shows the five reading sizes",
   (await page.eval("document.querySelectorAll('[data-sizepick]').length")) === 5);
// UI scale is a SEPARATE axis from reading size, so the tab has to be its own and show its own
// options — the bug to catch is one tab rendering both lists.
await page.eval("(() => { document.querySelector('[data-looktab=\"scale\"]').click(); return 1; })()");
await wait(300);
ok("  and UI is its own tab with four scales and no sizes on it",
   (await page.eval("document.querySelectorAll('[data-scalepick]').length")) === 4
   && (await page.eval("document.querySelectorAll('[data-sizepick]').length")) === 0);
// It has to reach the document, or it is a chip that lights up and moves nothing.
await page.eval("(() => { document.querySelector('[data-scalepick=\"125\"]').click(); return 1; })()");
await wait(300);
ok("  and picking one lands on <html> where the CSS can see it",
   (await page.eval("document.documentElement.dataset.uiScale")) === '125');
await page.eval("(() => { document.querySelector('[data-scalepick=\"100\"]').click(); return 1; })()");
await page.eval("(() => { document.querySelector('[data-appearance=\"0\"]')?.click(); return 1; })()");

console.log(red ? `\n  ${red} RED` : "\n  all green");
