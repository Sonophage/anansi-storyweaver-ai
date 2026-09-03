// The seven surface changes from bugs.md, driven in a real browser:
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/surfaces.js
// Point it at a COPY. It writes a spice override and renames nothing else.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (l, g) => { if (!g) red++;
  console.log("  " + (g ? "ok  " : "FAIL") + " " + l + (g ? "" : "   <-- broken")); };
const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s=>s.title==='The Silver Key').id)()");

// 1. THE RESUME BAND, and the fold it exists to fix.
//
// The last-written book used to be a full-width `.storycard.hero` at aspect-ratio:3/4 — on a
// laptop about a thousand pixels of cover, with every other book below the fold and the one thing
// you came back for, where you stopped, not on the screen at all. It is a band now.
//
// TWO BOOKS ARE MADE HERE rather than seeded, per the convention in run.sh: a scenario that needs
// more than the fixture makes it. They are what the fold assertion measures against — with one
// book there is no shelf under the band and the geometry proves nothing.
const mk = (title, opening) => page.eval(`(async () => {
  const r = await (await fetch('/api/stories', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ title: ${JSON.stringify(title)}, genre: 'fantasy, noir, heist',
      opening: ${JSON.stringify(opening)} }) })).json();
  return r.id ?? null;
})()`);
await mk('A Book With Nothing In It', '');
await mk('A Book That Only Talks', '"Not tonight," he said. "Nor any night after."');
// The Silver Key last, so it is the newest and takes the band — it is the only fixture with prose,
// and a band with no prose in it cannot test the thing the band is for.
await page.eval(`(async () => { await fetch('/api/story', { method:'POST',
  headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ id: '${sid}', story: { genre: 'fantasy, noir, heist' } }) }); })()`);
await page.goto(B + "/");
await wait(700);

ok("1. the last-written story gets the resume band", await page.eval("!!document.querySelector('.resumeband')"));
const bandText = (await page.text('.resumeband') || '');
ok("   and it is The Silver Key, the book with prose in it", bandText.includes('Silver Key'));
ok("   it says what it is showing you", bandText.includes('Where you left off'));
// THE SENTENCE IS THE POINT. Everything above is chrome that would render over an empty band.
ok(`   and carries a sentence of the writer's own prose (${JSON.stringify(bandText.slice(0, 0) || '')})`,
   await page.eval(`(() => { const q = document.querySelector('.resumeband .quote');
     return !!q && q.textContent.trim().length > 20; })()`));
ok("   with one gold action that is not a navigation to chapter one",
   await page.eval("!!document.querySelector('.resumeband [data-carryon]') && !!document.querySelector('.resumeband [data-readfrom]')"));
ok("   and no hero card survives beside it",
   await page.eval("!document.querySelector('.storycard.hero')"));

// THE FOLD. This is the whole argument of the redesign and the only assertion that can falsify it:
// a band that grows, a cover that goes back to 3/4 at four across, or a card that gains a row will
// all push the shelf off a laptop screen again, and every other check here would still pass.
// AT 1440x900 MEANING THE VIEWPORT, not the window. The driver's window is 1440x900 and its
// innerHeight is 757 once the browser's own furniture is taken out, so measuring against the
// window would be measuring chromium rather than the shelf.
await page.viewport(1440, 900);
const fold = await page.eval(`(() => {
  const cards = [...document.querySelectorAll('#page .shelfgrid .storycard')];
  const band = document.querySelector('.resumeband');
  const second = cards[1] ?? cards[0];
  return JSON.stringify({ cards: cards.length, innerH: innerHeight,
    bandH: Math.round(band.getBoundingClientRect().height),
    bottom: second ? Math.round(second.getBoundingClientRect().bottom) : null });
})()`);
const f = JSON.parse(fold);
console.log("   fold: " + fold);
ok(`   the shelf holds the other books as cards (${f.cards})`, f.cards >= 2);
ok(`   and the second book is inside a 1440x900 viewport (${f.bottom} of ${f.innerH})`,
   f.innerH === 900 && f.bottom !== null && f.bottom <= f.innerH);
await page.viewport(1440, 757);   // back to the driver's own size for everything after this

// #19 took New story OFF the shelf entirely — the bar pill is the one door, and it lost `deskonly`
// in the same change so a phone still has it. The design puts two dashed maker cells back into the
// grid; #19 is the more recent decision about this shelf and it stands.
ok("   the shelf itself offers no New story button",
   await page.eval("!document.querySelector('#page [data-open=new]')"));
ok("   while the bar still does, un-hidden",
   await page.eval("(() => { const b = document.querySelector('#bar [data-open=new]');"
     + " return !!b && !b.classList.contains('deskonly'); })()"));

// A BOOK WITH NOTHING IN IT, AND A BOOK THAT ONLY TALKS. Two states the shelf claims to
// distinguish, and the second is the one that would fail silently: stripping the quotes out of
// `"Not tonight," he said.` leaves ` he said.`, which passes every structural check and prints on
// the card as the last thing the writer wrote.
const cardOf = (t) => page.eval(`(() => { const c = [...document.querySelectorAll('#page .storycard')]
  .find(x => x.textContent.includes(${JSON.stringify(t)})); return c ? c.textContent.replace(/\s+/g,' ') : ''; })()`);
const emptyCard = await cardOf('A Book With Nothing In It');
ok(`   a book with no passages says so (${JSON.stringify(emptyCard.slice(0, 60))})`,
   emptyCard.includes('nothing written yet'));
const talkCard = await cardOf('A Book That Only Talks');
ok(`   and a book whose last passage is all dialogue refuses to quote it (${JSON.stringify(talkCard.slice(0, 90))})`,
   talkCard.includes('all dialogue') && !talkCard.includes('he said'));

// 2. the pill is the genre — and genre is comma-separated, so it is pillS. An AI Dungeon import
// writes its whole tag list into this field, which is how a card came to read "horror, nsfw"
// inside a single pill. Asserted on the band, which follows the same rule as a card.
const pills = await page.eval("(() => [...document.querySelectorAll('.resumeband .tag')]"
  + ".map(t => t.textContent.trim()).join('|'))()");
console.log("   tag pills: " + JSON.stringify(pills));
ok(`2. a comma-separated genre is one tag per pill (${JSON.stringify(pills)})`,
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

/* 3b. THE PASSAGES ARE SEPARATED, AND THE NEWEST ONE'S RING DOES NOT CUT THE PARAGRAPH ABOVE IT.
 *
 * MEASURED IN A BROWSER, because nothing else can see it. Wrapping each chapter in a <section> on
 * 2026-09-01 — so a continuous read had a break between chapters — made that section a single flex
 * child of #col, and the 30px `--gap` that had always separated PASSAGES started separating
 * CHAPTERS instead. Every passage butted against the next, and the newest passage's outline (12px of
 * offset, 1px of line) overlapped the paragraph above by 13px: a line struck through the last
 * sentence of the previous passage, which is how Seth reported it.
 *
 * Every suite was green for it. A layout regression is invisible to markup checks by construction —
 * BUILD-STATE 3b's rule, "do not audit a surface with a pattern; read the object" — so this reads the
 * object.
 */
{
  await page.goto(B + "/#" + sid);
  for (let i = 0; i < 40 && !(await page.eval("document.querySelectorAll('#col .block').length > 1")); i++) await wait(150);
  const m = await page.eval(`(() => {
    const bs = [...document.querySelectorAll('#col .block')];
    const last = bs.at(-1), prev = bs.at(-2);
    if (!last || !prev) return { blocks: bs.length };
    const cs = getComputedStyle(last);
    const lr = last.getBoundingClientRect(), pr = prev.getBoundingClientRect();
    const reach = parseFloat(cs.outlineStyle === 'none' ? '0' : cs.outlineOffset)
                + parseFloat(cs.outlineStyle === 'none' ? '0' : cs.outlineWidth);
    return { blocks: bs.length, gap: +(lr.top - pr.bottom).toFixed(1),
             clear: +(lr.top - pr.bottom - reach).toFixed(1) }; })()`);
  console.log("  passage spacing: " + JSON.stringify(m));
  ok("3b. consecutive passages are separated (" + m.gap + "px)", m.blocks > 1 && m.gap >= 12);
  ok("   and the newest one's ring clears the paragraph above it (" + m.clear + "px)", m.clear > 0);
}

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
// A CLAUSE THE CONTRACT GUARD REFUSES TO LOSE, not the opening line. This read "prose engine" —
// the first three words of SYSTEM — until Seth rewrote it on 2026-09-01 to open "You are the
// continuation of this manuscript", and the check went red for a prompt that was perfectly real.
// `test/db.ts` asserts "Output prose only" survives every rewrite of SYSTEM, so probing for that
// cannot rot without something louder going red first.
ok("   and it is the real thing", (await page.text('#sideBody pre') || '').includes('Output prose only'));
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

// 7. composer: no Discard/Keep, and Regenerate on the passage rather than in the chrome
await page.goto(B + "/#" + sid);
const dock = (await page.text('#dockCol') || '');
ok("7. Discard and Keep are gone", !dock.includes('DISCARD') && !/\bKeep\b/.test(dock));
// Regenerate left the top bar on 2026-08-27 for the end of the page, where Continue joined it.
// Both sides asserted: gone from the chrome, present on the last passage. Only the pair fails
// when it is added in one place and not removed from the other.
ok("   Regenerate is off the chrome", await page.eval("!document.querySelector('#bar [data-reroll]')"));
ok("   and on the last passage, with Continue", await page.eval(
  "(() => { const c = document.querySelector('#col .carry');"
  + " return !!c && !!c.querySelector('[data-re]') && !!c.querySelector('[data-continue]'); })()"));
// One carry row, on the LAST passage only — one per passage is a page of buttons.
ok("   and there is exactly one of it", await page.eval(
  "document.querySelectorAll('#col .carry').length === 1"));

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
    // #inputMirror, NOT #input. The composer's textarea renders its own text transparent and a
    // mirror behind it draws what you read — that is the only way to colour one word inside a
    // textarea, which is what an @ mention needs. Measuring #input here reported 1.1:1 on every
    // theme and was right about the element and wrong about the text: the letters on the screen
    // are the mirror's.
    //
    // The PAIR is checked below, so this is not the check being told to look away: a transparent
    // textarea with no mirror behind it, or a mirror that is itself transparent, is still a red.
    // Both of those have shipped this week.
    for (const sel of ['#col .narr', '#sideBody', '#bar .serif:not(.wordmark)', '#modes button', '#modes select.dial',
                       '.hint', '#inputMirror']) {
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

  // AND THE MIRRORED PAIR IS COHERENT. Exactly one of the two carries the visible text: the
  // textarea's own colour is transparent AND a mirror exists behind it that is not. Either half
  // alone has shipped — the textarea visible with a mirror behind it double-prints every letter,
  // and both transparent means typing produces nothing at all, which is what happened on
  // 2026-08-28 and what Seth saw before I did.
  const pair = JSON.parse(await page.eval(`(() => {
    const out = [];
    for (const [box, mir] of [['input', 'inputMirror'], ['askBox', 'askMirror']]) {
      const b = document.getElementById(box), m = document.getElementById(mir);
      if (!b || !m) continue;
      out.push([box, getComputedStyle(b).color, getComputedStyle(m).color]);
    }
    return JSON.stringify(out); })()`));
  for (const [box, boxColor, mirColor] of pair) {
    const clear = (c) => /rgba\(0, 0, 0, 0\)|transparent/.test(c);
    ok(`   #${box} is mirrored — the box's own text is out of the way and the mirror's is not`,
       clear(boxColor) && !clear(mirColor));
  }
}
await page.eval("(() => { document.documentElement.dataset.uiTheme = 'obsidian'; return 1; })()");

// The motion system has to actually apply, not merely be declared.
await page.goto(B + "/#" + sid + "/threads");
await wait(700);
// --t-page LEFT THE LIST below because 13383a6 deleted it — "settle, lift and sheet are deleted,
// and --t-page with them" — and this check went on asserting that it resolved, so it has been red
// since that commit over a token nobody wants back. --t-veilout is here in its place: it is the one
// motion token added since, and the veil is the surface that uses it.
// THE COMMENT IS OUT HERE, NOT IN THE EVAL BELOW: that is a template literal, and a backtick in it
// ends the string — the same trap the db.ts schema and app.js markup both carry a warning about.
const motion = JSON.parse(await page.eval(`(() => {
  const cs = getComputedStyle(document.documentElement);
  const newest = document.querySelector('#col .block.newest');
  const card = document.querySelector('#sideBody .card, #sideBody .row');
  return JSON.stringify({
    tokens: ['--ease','--ease-out','--t-fast','--t','--t-slow','--t-veilout'].map(k => cs.getPropertyValue(k).trim()),
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

// The cover, end to end and over real HTTP: the unit checks in test/scope.ts call the handler, and
// what they cannot see is the wire — whether serve.ts sends the JPEG inline or as a download, and
// whether the card's own markup asks for it. A canvas makes the JPEG, so the bytes travel the exact
// path a picked file does.
await page.goto(B + "/");
await wait(400);
const jpegUrl = await page.eval("(() => { const c = Object.assign(document.createElement('canvas'),"
  + " { width: 40, height: 24 }); const x = c.getContext('2d');"
  + " x.fillStyle = '#8a4'; x.fillRect(0,0,40,24); return c.toDataURL('image/jpeg', 0.8); })()");
ok("13. the browser can make a JPEG data URL to send", jpegUrl.startsWith('data:image/jpeg;base64,'));

// A PNG relabelled as JPEG, refused over the wire. The prefix says jpeg and the bytes say PNG.
const relabelled = await page.eval("(async () => { const png = Object.assign(document.createElement('canvas'),"
  + " { width: 4, height: 4 }).toDataURL('image/png').split(',')[1];"
  + " const r = await fetch('/api/cover', { method:'POST', headers:{'Content-Type':'application/json'},"
  + " body: JSON.stringify({ storyId: '" + sid + "', dataUrl: 'data:image/jpeg;base64,' + png }) });"
  + " return r.status; })()");
ok(`   a PNG wearing a JPEG prefix is refused at the wire (${relabelled})`, relabelled === 400);

const set = await page.eval("(async () => { const r = await fetch('/api/cover', { method:'POST',"
  + " headers:{'Content-Type':'application/json'}, body: JSON.stringify({ storyId: '" + sid + "',"
  + " dataUrl: " + JSON.stringify(jpegUrl) + " }) }); const j = await r.json(); return j.cover ?? j.error; })()");
ok("   and a real one is accepted, with a version to key the URL on", typeof set === 'number' && set > 0);

// Inline, not a download: an <img> pointed at Content-Disposition: attachment shows nothing.
const head = await page.eval("(async () => { const r = await fetch('/api/cover?story=" + sid + "&v=' + "
  + set + "); return [r.headers.get('content-type'), r.headers.get('content-disposition'),"
  + " r.headers.get('cache-control'), (await r.blob()).size].join('|'); })()");
console.log("   cover response: " + head);
ok("   it is served inline as image/jpeg, cacheable forever",
   // An absent header joins as empty, not as "null" — so the empty second field IS the assertion
   // that no Content-Disposition went out.
   head.startsWith('image/jpeg||') && head.includes('immutable') && Number(head.split('|')[3]) > 0);

await page.goto(B + "/");
await wait(500);
// The Silver Key holds the band now, and the band's cover is an `.art` like a card's — same
// background rule, same fallback gradient underneath.
const cardArt = await page.eval("(() => { const c = document.querySelector('.resumeband .art');"
  + " return c ? c.getAttribute('style') : ''; })()");
ok("   and the cover on the shelf asks for it, with the version in the URL",
   cardArt.includes('/api/cover?story=' + sid) && cardArt.includes('v=' + set));
// The gradient stays underneath as the fallback, so a cover that has not arrived is not a blank hole.
ok("   with the gradient still under it while it loads", /gradient/.test(cardArt));

await page.eval("(async () => { await fetch('/api/cover', { method:'DELETE',"
  + " headers:{'Content-Type':'application/json'}, body: JSON.stringify({ storyId: '" + sid + "' }) }); })()");
await page.goto(B + "/");
await wait(500);
const bare = await page.eval("(() => { const c = document.querySelector('.resumeband .art');"
  + " return c ? c.getAttribute('style') : ''; })()");
ok("   removing it puts the cover back to its gradient", !bare.includes('/api/cover') && /gradient/.test(bare));

// ---- CHECKBOXES ARE DRAWN, not the platform's (2026-09-02). Seth: "all checkboxes should be styled
// and auto save so i dont have to hit save everytime." There were nine in the app and not one line
// of CSS for them, so every one was a white box with a blue tick on nineteen themes that own
// neither colour. Asserted on `appearance` and on the checked state, because a box that is styled
// only while empty is the half-done version of this.
{
  // ON THE PROSE SEARCH PANEL, which is where the nearest checkbox lives — "search every story".
  // The first version of this block ran wherever the motion checks had left the page and measured
  // null, which is a check that cannot fire.
  await page.goto(B + "/#" + sid + "/search");
  for (let i = 0; i < 40 && !(await page.eval("!!document.querySelector('input[type=\"checkbox\"]')")); i++) await wait(250);
  const read = () => page.eval(`(() => {
    const b = document.querySelector('input[type="checkbox"]');
    if (!b) return null;
    const c = getComputedStyle(b);
    const tick = getComputedStyle(b, '::after');
    return JSON.stringify({ checked: b.checked, appearance: c.appearance,
      radius: c.borderTopLeftRadius, w: c.width, border: c.borderTopColor,
      bg: c.backgroundColor,
      tick: (tick.maskImage ?? 'none') !== 'none' || (tick.webkitMaskImage ?? 'none') !== 'none' });
  })()`).then((x) => (x ? JSON.parse(x) : null));
  // A REAL PRESS, not `b.checked = true` and a synchronous read: the first version did that and got
  // the unchecked colour back, because the style had not been recalculated by the time it looked.
  const off = await read();
  await page.click('input[type="checkbox"]');
  await wait(350);
  const on = await read();
  await page.click('input[type="checkbox"]');
  await wait(250);
  const box = off && on ? { ...off, offBg: off.bg, onBg: on.bg, tickOn: on.tick } : null;
  console.log("  checkbox: " + JSON.stringify(box));
  ok("a checkbox is drawn by the app, not by the platform",
     !!box && box.appearance === 'none' && box.radius !== '0px');
  // The checked state has to be the accent and not the platform's blue, which is the part a bare
  // `appearance:none` leaves behind — it takes the tick away and gives you nothing back.
  ok(`  and its checked state is the accent (${box && box.offBg} -> ${box && box.onBg})`,
     !!box && box.onBg !== box.offBg);
  // And the mark inside it is drawn too. `appearance:none` takes the platform's tick away and gives
  // nothing back, so a box that fills with gold and has no tick in it is the half-done version.
  ok("  with a tick drawn in it", !!box && box.tickOn === true);
}

console.log(red ? `\n  ${red} RED` : "\n  all green");
