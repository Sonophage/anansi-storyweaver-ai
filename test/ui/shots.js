// Screenshots of every surface at three widths, for design review. Not a check: its one assertion
// is that it wrote them all, and it is not in the default run. Writes PNGs to ANANSI_SHOTS
// (default ~/.cache/anansi-v2/shots), outside the tree: they show only the seeded test books.
//
//   ANANSI_SHOTS=/some/dir bash test/ui/run.sh shots
//
// A long panel or page is shot in parts down its scroll (`-p2`, `-p3`, at most five). Reduced
// motion is asked for first, so no heading is caught half-decoded.
const B = "http://127.0.0.1:5179";
const { mkdirSync } = await import('node:fs');
const OUT = process.env.ANANSI_SHOTS || (process.env.HOME + '/.cache/anansi-v2/shots');
mkdirSync(OUT, { recursive: true });
const SIZES = [['desk', 1440, 900], ['tablet', 900, 1180], ['phone', 390, 844]];
await page.still();
const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s=>s.title==='The Silver Key').id)()");
const ready = async () => { for (let i = 0; i < 40 && !(await page.eval("!!document.querySelector('#rail')")); i++) await wait(250); await wait(700); };
let n = 0;

/* THE WORDS ON SCREEN, for bench/words.ts. Every visible text node and every title, aria-label,
 * placeholder and option label, once per surface at desk width. The prose is left out — a
 * passage's own words are the writer's, not the app's — so `#col .block` and form values are not
 * read. Written to text.json beside the shots. */
const TEXT = {};
const words = async (name) => {
  TEXT[name] = await page.eval(`(() => {
    const out = [];
    const seen = (el) => el && el.checkVisibility ? el.checkVisibility() : true;
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t; (t = w.nextNode());) {
      const el = t.parentElement;
      if (!el || el.closest('script,style,textarea,#col .block') || !seen(el)) continue;
      const s = t.textContent.replace(/\\s+/g, ' ').trim();
      if (s) out.push(s);
    }
    for (const el of document.querySelectorAll('[title],[aria-label],[placeholder],option')) {
      if (el.tagName !== 'OPTION' && !seen(el)) continue;
      for (const a of ['title', 'aria-label', 'placeholder']) if (el.getAttribute(a)) out.push(el.getAttribute(a));
      if (el.tagName === 'OPTION') out.push(el.textContent.trim());
    }
    return out;
  })()`);
};

/** Every size, and down the scroller in parts. `scroller` is the element that scrolls: the side
 *  panel's body, or the workspace page. The book's prose is shot at its resting place only. */
const snap = async (name, scroller) => {
  for (const [tag, w, h] of SIZES) {
    await page.viewport(w, h); await wait(400);
    if (tag === 'desk') await words(name);
    if (scroller) await page.eval(`(() => { const e = document.querySelector('${scroller}'); if (e) e.scrollTop = 0; return 1; })()`);
    await wait(150);
    await page.shot(`${OUT}/${name}--${tag}.png`, [w, h]); n++;
    if (!scroller) continue;
    for (let part = 2; part <= 5; part++) {
      const moved = await page.eval(`(() => { const e = document.querySelector('${scroller}');
        if (!e || e.scrollTop + e.clientHeight >= e.scrollHeight - 4) return false;
        e.scrollTop += Math.floor(e.clientHeight * 0.85); return true; })()`);
      if (!moved) break;
      await wait(200);
      await page.shot(`${OUT}/${name}--${tag}-p${part}.png`, [w, h]); n++;
    }
  }
};
const book = async (hash) => { await page.viewport(1440, 900); await page.goto(B + "/#" + sid + hash); await ready(); };
const press = async (sel) => { await page.click(sel); await wait(600); };

// The workspace pages have no hash, so each is reached by its rail row from the shelf.
for (const k of ['stories', 'create', 'canon', 'import', 'prefs', 'news', 'bug', 'forge']) {
  await page.viewport(1440, 900);
  await page.goto(B + "/"); await ready();
  if (k !== 'stories') await press(`[data-nav="${k}"]`);
  await snap(`w-${k}`, '#page');
}

// The book with no panel open, then every hash-addressable panel.
await book('');
await snap('s-book');
for (const p of ['search', 'waiting', 'story', 'chapter', 'chapters', 'threads', 'strings', 'context',
                 'teller', 'anansi', 'model', 'findmodel', 'setup']) {
  await book('/' + p);
  await snap(`s-${p}`, '#sideBody');
}

// The tabs inside Story and This chapter, past the first.
for (const t of ['book', 'world', 'keep']) { await book('/story'); await press(`[data-storytab="${t}"]`); await snap(`s-story-${t}`, '#sideBody'); }
for (const t of ['proposed', 'summaries', 'branches']) { await book('/chapter'); await press(`[data-chaptab="${t}"]`); await snap(`s-chapter-${t}`, '#sideBody'); }

// A card as read, then its editor and the editor's tabs, from Marek Vale: test/ui/seed.ts gives him
// a pocket, an outfit and a change over time, so the Pockets and Over time tabs are not empty.
const MAREK = `[data-entry="${await (async () => { await book('/threads'); return page.eval(
  "[...document.querySelectorAll('[data-entry]')].find((x) => x.querySelector('.platename')?.textContent === 'Marek Vale')?.dataset.entry ?? ''"); })()}"]`;
await book('/threads'); await press(MAREK); await snap('s-entry-read', '#sideBody');
for (const t of ['card', 'rooms', 'time', 'more']) {
  await book('/threads');
  await press(MAREK);
  await press('[data-cardview="form"]');
  if (t !== 'card') await press(`[data-cardtab="${t}"]`);
  // Over time is a fold, shut by default: open it, or the tab shows only its heading.
  if (t === 'time' && !(await page.eval("!!document.querySelector('[data-fold=\"states\"]')?.parentElement?.open")))
    await press('[data-fold="states"]');
  await snap(`s-entry-${t}`, '#sideBody');
}

// The passage tray, opened by a double-click on the newest passage, the way test/ui/tray.js does.
for (const [tag, w, h] of SIZES) {
  await book('');
  await page.viewport(w, h); await wait(400);
  await page.eval("(() => { const b = document.querySelector('#col .block.newest') || document.querySelector('#col .block'); b?.dispatchEvent(new MouseEvent('dblclick',{bubbles:true})); return 1; })()");
  await wait(600);
  if (tag === 'desk') await words('s-tray');
  await page.shot(`${OUT}/s-tray--${tag}.png`, [w, h]); n++;
}

// The story menu, opened from the header title, at phone width where it is a full-screen sheet.
await book('');
await page.viewport(390, 844); await wait(400);
await press('[data-railview="story"]');
await words('s-menu');
await page.shot(`${OUT}/s-menu--phone.png`, [390, 844]); n++;

// THE WIZARD, every step. Spark and its helpers are answered in the page with a fixed skeleton,
// the way test/ui/wizard.js does, so no model is asked; nothing is created, Accept is never pressed.
await page.viewport(1440, 900);
await page.goto(B + "/"); await ready();
await page.eval(`(() => {
  const real = window.fetch;
  const json = (x) => Promise.resolve(new Response(JSON.stringify(x), { headers: { 'Content-Type': 'application/json' } }));
  window.fetch = (u, o) => {
    const url = String(u);
    if (url.includes('/api/spark/review')) return json({ changes: [{ field: 'title', value: 'The Tide Clerk', why: 'The premise is about counting, not about salt.' }], entries: [] });
    if (url.includes('/api/spark/style')) return json({ style: 'Short scenes. Weather does the work.' });
    if (url.includes('/api/spark/cast')) return json({ entries: [
      { title: 'Ilva Marren', entryType: 'character', activation: 'always_on', body: '[Ilva Marren: a tide-clerk.]', keys: ['Ilva'] },
      { title: 'Kade Ashford', entryType: 'character', activation: 'always_on', body: '[Kade Ashford: a creditor.]', keys: ['Kade'] }],
      persona: 'Ilva Marren', lockedCharacter: 'Kade Ashford' });
    if (url.includes('/api/spark')) return json({ story: { title: 'The Salt Ledger', genre: 'noir, gothic',
      premise: 'A tide-clerk counts what the sea returns.', setting: 'Fallow Quay', pov: 'third limited, past tense',
      spice: 2, writingStyle: 'Clipped and wet.', persona: null, lockedCharacter: null }, entries: [] });
    return real(u, o);
  };
  return 1; })()`);
await press('[data-open="new"]');
await page.type('#idea', 'a tide-clerk who counts what the sea gives back');
await press('[data-spark="1"]'); await wait(800);
const steps = JSON.parse(await page.eval(`JSON.stringify([...document.querySelectorAll('[data-sparkstep][aria-label]')]
  .map(e => [e.dataset.sparkstep, e.getAttribute('aria-label')]))`));
for (const [k, label] of steps) {
  await page.viewport(1440, 900);
  await press(`[data-sparkstep="${k}"][aria-label="${label}"]`);
  await snap(`w-create-${k}-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`, '#page');
}

const { writeFileSync } = await import('node:fs');
writeFileSync(`${OUT}/text.json`, JSON.stringify(TEXT, null, 1));
console.log(`  ${steps.length ? 'ok  ' : 'FAIL'} ${n} screenshots in ${OUT}, ${steps.length} wizard steps`);
console.log(steps.length ? '\n  all green' : '\n  1 RED');
