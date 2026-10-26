// needs: fake-router
// Writing inline: the passage streams into the page, and the full-screen veil stays retired.
//
//   bash test/ui/run.sh inline
//
// Seth, 2026-10-25: "lets get rid of that transition and just do it inline. its pretty eye candy
// but lets retire it in a way where i can bring it back if no one likes the change." The veil is
// kept behind `anansi.veil` (test/ui/weave.js switches it on and tests it); this is the default.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (m, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${m}${cond ? "" : "   <-- broken"}`); if (!cond) red++; };
const until = async (expr, n = 60, ms = 100) => {
  for (let i = 0; i < n; i++) { if (await page.eval(expr)) return true; await wait(ms); }
  return false;
};

const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find((s) => s.title === 'The Silver Key').id)()");
const models = () => page.eval(`(async () => (await (await fetch('/api/story?story=${sid}')).json()).passages.filter((p) => p.author === 'model').length)()`);
const send = async (text) => {
  await page.eval(`(() => { const i = document.getElementById('input'); i.value = ${JSON.stringify(text)};
    i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
  await page.eval("(() => { document.getElementById('send').click(); return 1; })()");
};

await page.goto(B + "/#" + sid);
await until("!!document.getElementById('send')");
ok("the veil is off by default", (await page.eval("localStorage.getItem('anansi.veil')")) !== '1');

// ---- a passage, written into the page
const before = await models();
await send("She reaches the door.");
ok("the passage being written sits in the page, under the last one",
   await until("!!document.querySelector('#col > #ghost.inlive')"));
ok("  and there is no full-screen veil", !(await page.eval("!!document.querySelector('#ghost.veil')")));
ok("  and Stop stays on the composer", await page.eval("!!document.querySelector('#send[data-stop]')"));
// GOLD AND STILL (Seth, 2026-10-26): the one press while she writes, and nothing pulsing on it.
const stop = await page.eval(`(() => { const b = document.querySelector('#send[data-stop]'); if (!b) return null;
  const cs = getComputedStyle(b), probe = document.createElement('i'); probe.style.color = 'var(--gold)';
  document.body.append(probe); const gold = getComputedStyle(probe).color; probe.remove();
  return JSON.stringify({ bg: cs.backgroundColor, gold, anim: cs.animationName }); })()`).then((x) => x && JSON.parse(x));
ok(`  and Stop is gold and still (${JSON.stringify(stop)})`, !!stop && stop.bg === stop.gold && stop.anim === 'none');
ok("its words arrive in it", await until("(document.querySelector('#ghost .veiltext')?.textContent ?? '').length > 0", 80));
ok("when it is done it becomes a passage like the others",
   await until("!document.getElementById('ghost')", 120));
ok(`  and it was written (${before} -> ${await models()})`, (await models()) === before + 1);
ok("  with no tap needed to see it", await until("!document.querySelector('#send[data-stop]')", 40));

// ---- where the page sits, and how the words arrive (Seth, 2026-10-25)
// At the first word the page moves ONCE so the end of the passage before sits 72px under the top
// (the seam), and then it stays still while she writes below the fold. Each word comes up out of
// a blur (Seth, 2026-10-26: "cinematically fade in from a blur"; it scrambled for a day before).
// Watched from inside the page, because the moments are shorter than a round trip from here.
await page.eval(`(() => { const read = document.getElementById('read');
  // Instantly: #read scrolls smoothly, and a page still gliding to the bottom when the press lands
  // is not a reader sitting at the bottom.
  read.scrollTo({ top: read.scrollHeight, behavior: 'instant' });
  window.__w = { tops: [], blurred: 0, words: 0, seam: null };
  new MutationObserver((ms) => { for (const m of ms) {
    for (const n of m.addedNodes ?? []) if (n.classList?.contains?.('w')) {
      window.__w.words++; window.__w.tops.push(Math.round(read.scrollTop));
      // The last word lands in the frame that takes the block away, and a detached word has no
      // style to read: counted only while it is on the page.
      if (n.isConnected) { window.__w.live = (window.__w.live ?? 0) + 1;
        if (getComputedStyle(n).animationName === 'inkin') window.__w.blurred++; }
      if (window.__w.words === 1) requestAnimationFrame(() => { const g = document.getElementById('ghost');
        const p = [...document.querySelectorAll('#col .block')].filter((b) => b !== g && b.offsetParent !== null
          && (b.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        if (p) window.__w.seam = Math.round(p.getBoundingClientRect().bottom - read.getBoundingClientRect().top); }); } } })
    .observe(document.getElementById('col'), { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  return 1; })()`);
await send("He looks back once.");
await until("!document.getElementById('ghost')", 120);
await wait(300);
const w = await page.eval("JSON.stringify(window.__w)").then(JSON.parse);
console.log("  arrival: " + JSON.stringify(w));
ok(`the words come up out of a blur (${w.blurred} of the ${w.live} on the page)`, w.live > 0 && w.blurred === w.live);
// The last word lands in the same frame as the finished passage, which takes the room held open
// below the seam away; the fixture's passage is five words, shorter than a screen, so the page
// settles then. A real passage is longer than the screen and does not.
const writing = w.tops.slice(0, -1);
ok(`  the page does not follow them down while she writes (scroll positions ${JSON.stringify([...new Set(writing)])})`,
   writing.length > 0 && new Set(writing).size === 1);
ok(`  and at the first word the passage before sits at the seam, 72px under the top (${w.seam})`,
   w.seam !== null && Math.abs(w.seam - 72) <= 8);

// ---- a re-roll of the last passage: the new version writes where the old one was
await page.eval("(() => { document.querySelector('#nextbar [data-re]').click(); return 1; })()");
ok("a re-roll writes inline too", await until("!!document.querySelector('#col > #ghost.inlive')"));
ok("  and the version it replaces steps aside while it does",
   (await page.eval("document.querySelectorAll('#col .block.rerolling-out').length")) === 1);
ok("  and is replaced when it lands", await until("!document.getElementById('ghost') && !document.querySelector('.rerolling-out')", 120));
// NO TOAST FOR A NEW VERSION (Seth, 2026-10-26): the new take on the page says it.
await wait(300);
ok(`  with no toast saying so (${JSON.stringify(await page.text('#toast'))})`,
   !/new version/i.test((await page.text('#toast')) || ''));

// ---- Stop, from the composer
await send("He does not answer.");
await until("!!document.querySelector('#col > #ghost.inlive')");
await page.eval("(() => { document.querySelector('#send[data-stop]').click(); return 1; })()");
ok("Stop takes the passage being written away", await until("!document.getElementById('ghost')", 40));

console.log(red ? `\n  ${red} RED` : "\n  all green");
