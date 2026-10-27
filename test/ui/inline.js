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
// Send folds the box (Seth, 2026-10-26), so the composer's Stop is ✦ on the three buttons.
ok("  and Stop stays on the composer", await page.eval("!!document.querySelector('#cont[data-stop]')?.offsetParent"));
// FADED AND STILL (Seth, 2026-10-26: "faded so it matches the one on the left"; earlier the same day,
// "not animated"). The fade is read off the disabled ↻ beside it, not written here as a number.
const stop = await page.eval(`(() => { const b = document.querySelector('#cont[data-stop]'), r = document.querySelector('#nextrow [data-re]');
  if (!b || !r) return null; const cs = getComputedStyle(b);
  return JSON.stringify({ op: cs.opacity, re: getComputedStyle(r).opacity, anim: cs.animationName }); })()`).then((x) => x && JSON.parse(x));
ok(`  and Stop is faded like ↻ and still (${JSON.stringify(stop)})`, !!stop && stop.op === stop.re && Number(stop.op) < 1 && stop.anim === 'none');
ok("its words arrive in it", await until("(document.querySelector('#ghost .veiltext')?.textContent ?? '').length > 0", 80));
ok("when it is done it becomes a passage like the others",
   await until("!document.getElementById('ghost')", 120));
ok(`  and it was written (${before} -> ${await models()})`, (await models()) === before + 1);
ok("  with no tap needed to see it", await until("!document.querySelector('#dock [data-stop]')", 40));

// ---- where the page sits, and how the words arrive (Seth, 2026-10-25)
// At the press the page moves ONCE so the new entry's header sits at the top, under the app's header
// (Seth, 2026-10-27), and then it stays still while he writes below the fold. Each word comes up out of
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
      if (window.__w.words === 1) { const c = getComputedStyle(n);
        window.__w.font = [c.fontFamily, c.fontSize, c.fontStyle].join(' | ');
        window.__w.label = document.querySelector('#ghost .from')?.textContent.replace(/\\s+/g, ' ').trim() ?? null; }
      if (window.__w.words === 1) requestAnimationFrame(() => { const g = document.getElementById('ghost');
        const p = [...document.querySelectorAll('#col .block')].filter((b) => b !== g && b.offsetParent !== null
          && (b.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1);
        if (p) window.__w.seam = Math.round(p.getBoundingClientRect().bottom - read.getBoundingClientRect().top);
        window.__w.head = Math.round(g.getBoundingClientRect().top - read.getBoundingClientRect().top); }); } } })
    .observe(document.getElementById('col'), { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  return 1; })()`);
await send("He looks back once.");
await until("!document.getElementById('ghost')", 120);
await wait(300);
const w = await page.eval("JSON.stringify(window.__w)").then(JSON.parse);
console.log("  arrival: " + JSON.stringify(w));
ok(`the words come up out of a blur (${w.blurred} of the ${w.live} on the page)`, w.live > 0 && w.blurred === w.live);
// NOTHING MOVES while he writes; the last word is recorded in the frame the passage lands in, when
// the composer folds and the five-word fixture passage cannot fill the room it leaves.
const writing = w.tops.slice(0, -1);
ok(`  the page does not follow them down while he writes (scroll positions ${JSON.stringify([...new Set(writing)])})`,
   writing.length > 0 && new Set(writing).size === 1);
ok(`  and the new entry's header is at the top of the page (${w.head}px under it)`, w.head != null && w.head >= 0 && w.head <= 40);
// THE SAME TYPE BEFORE AND AFTER IT LANDS (Seth, 2026-10-26: "The font changes after the transition
// comes in"). The composer is on Speak, and Anansi's answer lands as narration in the book's font
// (2026-10-27: it was filed as the speaker's own line, a bubble in the UI sans).
const landedFont = await page.eval(`(() => { const b = [...document.querySelectorAll('#col .block')].at(-1);
  const t = b.querySelector('.said, .narr'), c = getComputedStyle(t); return [c.fontFamily, c.fontSize, c.fontStyle].join(' | '); })()`);
ok(`  and it is set in the same type while it arrives as when it has landed (${w.font} / ${landedFont})`, w.font === landedFont);
// AND THE SAME LABEL ("Speak · Aldis Fen"), from the first word (Seth, 2026-10-26: "add the label too").
const landedLabel = await page.eval("[...document.querySelectorAll('#col .block')].at(-1).querySelector('.from')?.textContent.replace(/\\s+/g, ' ').trim() ?? null");
ok(`  with the same label while it arrives as when it has landed (${w.label} / ${landedLabel})`, !!w.label && w.label === landedLabel);

// AND A READER WHO SCROLLED UP STAYS PUT WHEN IT LANDS (Seth, 2026-10-26: "a weird transition after
// the text is finished that takes me back to the top or the bottom of the screen"). The repaint at
// landing used to send a reader near the bottom to the bottom, and pin the seam for the rest.
await page.eval(`(() => { const read = document.getElementById('read');
  read.scrollTo({ top: read.scrollHeight, behavior: 'instant' }); window.__up = null;
  new MutationObserver((ms, obs) => { for (const m of ms) for (const n of m.addedNodes ?? []) if (n.classList?.contains?.('w')) {
    obs.disconnect(); read.scrollTo({ top: Math.max(0, read.scrollTop - 150), behavior: 'instant' });
    window.__up = Math.round(read.scrollTop); return; } })
    .observe(document.getElementById('col'), { subtree: true, childList: true });
  return 1; })()`);
await send("She does not turn round.");
await until("!document.getElementById('ghost')", 120);
await wait(400);
const up = await page.eval("JSON.stringify({ up: window.__up, now: Math.round(document.getElementById('read').scrollTop) })").then(JSON.parse);
ok(`  a reader scrolled up while she wrote is left where they were when it lands (${up.up} -> ${up.now})`,
   up.up !== null && Math.abs(up.now - up.up) <= 2);
ok("  and the passage is not wiped in again: its words already came in as she wrote",
   await page.eval("!document.querySelector('#col .block.arrived')"));

// AND NOTHING MOVES AT ALL WHILE IT LANDS (Seth, 2026-10-26: "still a transition after the ai has
// stopped writing that resets the reading position"). The restore of the held position glided, so a
// reader at the BOTTOM saw the page drop about 110px as the ghost came out and slide back over ten
// frames; a reader scrolled well up was below the drop and saw nothing, which is why the case above
// passed throughout. Every frame from the first word to 1.5s after landing is sampled.
await page.eval(`(() => { const read = document.getElementById('read');
  read.scrollTo({ top: read.scrollHeight, behavior: 'instant' }); window.__tops = []; window.__on = false; window.__stopTops = false;
  new MutationObserver((ms, obs) => { for (const m of ms) for (const n of m.addedNodes ?? []) if (n.classList?.contains?.('w')) {
    obs.disconnect(); window.__on = true; return; } }).observe(document.getElementById('col'), { subtree: true, childList: true });
  const tick = () => { if (window.__on) window.__tops.push(Math.round(read.scrollTop)); if (!window.__stopTops) requestAnimationFrame(tick); };
  requestAnimationFrame(tick); return 1; })()`);
await send("He waits at the bottom of the page.");
await until("!document.getElementById('ghost')", 120);
await wait(1500);
await page.eval("(() => { window.__stopTops = true; return 1; })()");
const tops = await page.eval("JSON.stringify(window.__tops)").then(JSON.parse);
const drift = tops.length ? Math.max(...tops.map((t) => Math.abs(t - tops.at(-1)))) : -1;
ok(`  and a reader at the bottom sees the page hold still as it lands (${tops.length} frames, at most ${drift}px off)`,
   tops.length > 10 && drift <= 2);

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
await page.eval("(() => { document.querySelector('#cont[data-stop]').click(); return 1; })()");
ok("Stop takes the passage being written away", await until("!document.getElementById('ghost')", 40));
// AT THE TOP, NOT IN THE MIDDLE (Seth, 2026-10-26: "let toasts happen at the top of the screen with a
// shadow beneath"). Shown by hand: the fake router writes the passage in one chunk, so Stop can land
// after it and say nothing, which would leave this asserting a toast that never came.
const tst = await page.eval(`(() => { const t = document.getElementById('toast'); if (!t) return null;
  const was = [t.hidden, t.textContent]; t.textContent = 'A line to measure.'; t.hidden = false;
  const r = t.getBoundingClientRect(), out = JSON.stringify({ top: Math.round(r.top), mid: Math.round(r.left + r.width / 2 - innerWidth / 2),
    shadow: getComputedStyle(t).boxShadow });
  [t.hidden, t.textContent] = was; return out; })()`).then((x) => x && JSON.parse(x));
ok(`a toast sits at the top of the screen, centred across it, a shadow under it (${JSON.stringify(tst)})`,
   !!tst && tst.top < 80 && Math.abs(tst.mid) <= 2 && tst.shadow !== 'none');

console.log(red ? `\n  ${red} RED` : "\n  all green");
