// PLAN-07 ask 3 — the veil goes full screen with Stop inside it, and the web draws itself while
// you wait. Seth: "the ai takes long to respond anyway while it formulates so having a ritual for
// this buys us that time while giving the user something to look at."
//
// Driven WITHOUT a model: `ghost()` and `unghost()` are called directly, because what is being
// checked is the surface — where the veil is, what is on top of it, whether Stop is reachable and
// whether it goes away again. test/ui/model.js drives the real Stop path against a live router and
// is opt-in for that reason.
//
//   test/ui/run.sh veil
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (l, g) => { if (!g) red++; console.log("  " + (g ? "ok  " : "RED ") + l); };

const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s=>s.title==='The Silver Key').id)()");
await page.mobile();
await page.goto(B + "/#" + sid);
for (let i = 0; i < 40 && !(await page.visible('#send')); i++) await wait(250);

// Raise it the way the app does: generate() puts the veil up BEFORE the request goes out, so a
// fetch that never settles gives a veil that stays up and no model is needed to see it.
await page.eval(`(() => {
  const real = window.fetch;
  window.fetch = (u, init) => {
    // Never settles — but it MUST reject on abort, the way a real fetch does. The first version
    // returned a promise that ignored the signal, so Stop aborted a controller nobody was
    // listening to, generateLive never rejected and unghost() never ran: two reds that were the
    // stub's fault and not the app's.
    if (String(u).includes('/api/generate')) return new Promise((_, rej) => {
      init?.signal?.addEventListener('abort', () => {
        const e = new Error('aborted'); e.name = 'AbortError'; rej(e);
      }, { once: true });
    });
    return real(u, init);
  };
  return 1;
})()`);
await page.eval("(() => { document.querySelector('[data-continue]')?.click(); return 1; })()");
await wait(900);

const geom = () => page.eval(`(() => {
  const g = document.getElementById('ghost');
  if (!g) return { up: false };
  const r = g.getBoundingClientRect();
  const cs = getComputedStyle(g);
  const st = g.querySelector('[data-stop]');
  const sr = st ? st.getBoundingClientRect() : null;
  const hit = sr ? document.elementFromPoint(sr.left + sr.width / 2, sr.top + sr.height / 2) : null;
  return { up: true, parent: g.parentElement?.id, position: cs.position, z: cs.zIndex,
    top: Math.round(r.top), left: Math.round(r.left), h: Math.round(r.height), w: Math.round(r.width),
    vh: innerHeight, vw: innerWidth,
    // Two spellings, because color-mix() does not resolve to rgba(): Chrome reports
    // \`color(srgb 0.039 0.039 0.047 / 0.62)\`. The first version of this knew only rgba() and
    // read a 62% veil as fully opaque — the detector wrong again rather than the code.
    alpha: (() => {
      const bg = cs.backgroundColor || '';
      const slash = /\\/\\s*([\\d.]+)\\s*\\)/.exec(bg);
      if (slash) return Number(slash[1]);
      const rgba = /rgba\\(([^)]+)\\)/.exec(bg);
      return rgba ? Number(rgba[1].split(',')[3]) : 1;
    })(),
    bg: cs.backgroundColor,
    backdrop: cs.backdropFilter || cs.webkitBackdropFilter,
    rows: g.querySelectorAll('.weave .wrow').length,
    cols: g.querySelector('.weave .wrow')?.children.length ?? 0,
    web: g.querySelectorAll('.web').length,
    // Every cell holding SOMETHING is the whole of "them all be random" that a still frame can
    // check. Whether the next frame differs is asserted below, by watching two of them.
    filled: [...g.querySelectorAll('.weave i')].every((c) => (c.textContent || '').trim().length),
    stop: !!st, stopOnTop: !!(hit && hit.closest('[data-stop]')) };
})()`);

const g = await geom();
console.log("  veil: " + JSON.stringify(g));
ok("pressing Continue raises the veil", g.up);
ok(`  it is a child of #shell, not of #doc (${g.parent})`, g.parent === 'shell');
ok(`  positioned absolute, so no ancestor can re-base it (${g.position})`, g.position === 'absolute');
ok(`  covering the whole window, header and composer included (${g.h} of ${g.vh})`,
   g.top === 0 && g.left === 0 && Math.abs(g.h - g.vh) <= 1 && Math.abs(g.w - g.vw) <= 1);
// The trade PLAN-07 names: covering everything is only safe BECAUSE Stop came inside.
//
// NO TINT NOW — the blur alone. What must never come back is an OPAQUE veil, which is what this
// asserted for a day and what "the book is gone" looks like.
ok(`  not opaque — the page is still behind it (alpha ${g.alpha})`, g.alpha < 1);
ok(`  and blurred, so it cannot be read through (${g.backdrop})`, /blur\(/.test(g.backdrop || ''));
// THE WEAVE REPLACED THE DRAWN WEB, 2026-08-28. Seth: "remove the web. instead copy the current
// scrmbled glyph animation and make it five lines tall and eleven letters long and them all be
// random." Six rows, not five, and the reason is in `ghost()`: the sixth letter of eleven is the
// middle column and ANANSI is six letters, so five rows cannot spell it downward.
ok(`  the drawn web is gone (${g.web} of them)`, g.web === 0);
ok(`  and a weave stands where it was (${g.rows} rows of ${g.cols})`, g.rows === 6 && g.cols === 11);
ok("  with every cell holding a glyph", g.filled);
// MOVING, not merely present. A grid of 66 characters that never changes is a picture, and a
// picture passes every check above.
const roll1 = await page.eval("[...document.querySelectorAll('#ghost .weave i')].map(c=>c.textContent).join('')");
await wait(400);
const roll2 = await page.eval("[...document.querySelectorAll('#ghost .weave i')].map(c=>c.textContent).join('')");
ok("  and it is rolling while she thinks", roll1 !== roll2 && roll1.length === 66);
ok("Stop is inside the veil", g.stop);
ok("  and it is the topmost thing at its own centre, so it can be pressed", g.stopOnTop);

// AND IT RESOLVES BEFORE IT GOES. The middle column stops being noise and says who wrote it while
// the rest of the weave fades out from under it. Asserted on the letters AND on the class that
// fades their neighbours: the word alone would pass with all 66 still on screen, which is the
// effect happening and not being seen.
await page.eval("(() => { document.querySelector('#ghost [data-stop]')?.click(); return 1; })()");
await wait(120);
const solved = await page.eval(`(() => { const w = document.querySelector('#ghost .weave');
  if (!w) return null;
  return { word: [...w.querySelectorAll('.wrow')].map(r => r.children[5]?.textContent ?? '').join(''),
           solved: w.classList.contains('solved'),
           dim: getComputedStyle(w.querySelector('.wrow i')).opacity }; })()`);
console.log("  resolve: " + JSON.stringify(solved));
ok(`  the middle column spells her name (${solved && solved.word})`, !!solved && solved.word === 'ANANSI');
ok("  and the rest of the weave is going out from under it",
   !!solved && solved.solved === true && Number(solved.dim) < 1);
// #29 gave the letters their own fade (.9s) inside a longer hold (1220ms), so `.leaving` is added
// LATER than it used to be — this waited 700ms, which was after the old 620ms hold and is now in
// the middle of the new one. Waits for the state rather than for a number, so tuning either the
// fade or the hold does not silently turn this into a check of the wrong moment.
for (let i = 0; i < 40; i++) {
  const st = await page.eval("(() => { const g = document.getElementById('ghost'); return g ? (g.classList.contains('leaving') ? 'leaving' : 'up') : 'gone'; })()");
  if (st !== 'up') break;
  await wait(50);
}
const mid = await page.eval("(() => { const g = document.getElementById('ghost'); return g ? (g.classList.contains('leaving') ? 'leaving' : 'up') : 'gone'; })()");
console.log("  right after Stop: " + mid);
ok(`pressing Stop starts the veil leaving rather than deleting it (${mid})`, mid === 'leaving');
for (let i = 0; i < 30; i++) {
  if ((await page.eval("!document.getElementById('ghost')"))) break;
  await wait(100);
}
ok("  and it is gone once the fade finishes", await page.eval("!document.getElementById('ghost')"));

console.log(red ? `\n  ${red} RED` : "\n  all green");
