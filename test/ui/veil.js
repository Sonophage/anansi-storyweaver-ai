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
    turning: /webturn/.test(getComputedStyle(g.querySelector('.web')).animationName || ''),
    stop: !!st, stopOnTop: !!(hit && hit.closest('[data-stop]')),
    strokes: g.querySelectorAll('.web g > *').length };
})()`);

const g = await geom();
console.log("  veil: " + JSON.stringify(g));
ok("pressing Continue raises the veil", g.up);
ok(`  it is a child of #shell, not of #doc (${g.parent})`, g.parent === 'shell');
ok(`  positioned absolute, so no ancestor can re-base it (${g.position})`, g.position === 'absolute');
ok(`  covering the whole window, header and composer included (${g.h} of ${g.vh})`,
   g.top === 0 && g.left === 0 && Math.abs(g.h - g.vh) <= 1 && Math.abs(g.w - g.vw) <= 1);
// The trade PLAN-07 names: covering everything is only safe BECAUSE Stop came inside.
// TRANSLUCENT AND BLURRED, which is the opposite of what this asserted an hour ago. Seth changed
// it: the page stays behind the veil, out of focus. "The book is busy" rather than "the book is
// gone". So the two halves are asserted together — a tint that is not opaque, and a blur that is
// actually declared, because a translucent veil with no blur is just a dimmed page you can still
// read the words of.
ok(`  translucent, so the page is still behind it (alpha ${g.alpha})`, g.alpha > 0 && g.alpha < 1);
ok(`  and blurred, so it cannot be read through (${g.backdrop})`, /blur\(/.test(g.backdrop || ''));
ok(`  and the web turns while she thinks (${g.turning})`, g.turning);
ok("Stop is inside the veil", g.stop);
ok("  and it is the topmost thing at its own centre, so it can be pressed", g.stopOnTop);
ok(`  the web is drawn from the app's own mark (${g.strokes} strokes)`, g.strokes === 7);

// It has to GO, and go by fading rather than vanishing.
await page.eval("(() => { document.querySelector('#ghost [data-stop]')?.click(); return 1; })()");
await wait(150);
const mid = await page.eval("(() => { const g = document.getElementById('ghost'); return g ? (g.classList.contains('leaving') ? 'leaving' : 'up') : 'gone'; })()");
console.log("  right after Stop: " + mid);
ok(`pressing Stop starts the veil leaving rather than deleting it (${mid})`, mid === 'leaving');
for (let i = 0; i < 30; i++) {
  if ((await page.eval("!document.getElementById('ghost')"))) break;
  await wait(100);
}
ok("  and it is gone once the fade finishes", await page.eval("!document.getElementById('ghost')"));

console.log(red ? `\n  ${red} RED` : "\n  all green");
