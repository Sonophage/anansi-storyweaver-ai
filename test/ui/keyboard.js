// The keyboard on a phone: Alter's box and the composer, with the keyboard up.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/keyboard.js
//
// Seth, 2026-10-26: "check how the bar and edit bars sit with a virtual keyboard on iphone", and
// "The edit screen should be the same maximized input screen."
//
// Headless Chrome has no soft keyboard, so both keyboards are played. Android's shortens the page
// (interactive-widget=resizes-content): played by making the window shorter. An iPhone's covers a
// page that keeps its height and only the visual viewport shrinks: played by standing a smaller
// visual viewport in for the real one and firing the resize Safari would fire. Neither is the
// device; Seth's phone check is.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (m, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${m}${cond ? "" : "   <-- broken"}`); if (!cond) red++; };

await page.mobile(390, 844);
const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s => s.title === 'The Silver Key').id)()");
await page.goto(B + "/#" + sid);
for (let i = 0; i < 40 && !(await page.eval("!!document.querySelector('#col .block [data-ed]')")); i++) await wait(250);

// Into Alter: the last passage's tray, then Alter.
const id = await page.eval(`(() => { const b = [...document.querySelectorAll('#col .block')].filter((x) => x.querySelector('[data-ed]')).at(-1);
  b.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); return b.querySelector('[data-ed]').dataset.ed; })()`);
await wait(500);
await page.eval(`(() => { document.querySelector('[data-ed="${id}"]').click(); return 1; })()`);
await wait(500);
ok("Alter opens its full-screen box", await page.eval("!!document.querySelector('.block.altering [data-editbox]')"));

const fakeVV = (h) => page.eval(`(() => { window.__realVV = window.__realVV ?? window.visualViewport;
  Object.defineProperty(window, 'visualViewport', { configurable: true,
    value: { height: ${h}, width: 390, scale: 1, offsetTop: 0, offsetLeft: 0, addEventListener() {} } });
  window.dispatchEvent(new Event('resize')); return 1; })()`);
const realVV = () => page.eval(`(() => { Object.defineProperty(window, 'visualViewport', { configurable: true, value: window.__realVV });
  window.dispatchEvent(new Event('resize')); return 1; })()`);
const altBox = () => page.eval(`(() => { const r = (sel) => { const e = document.querySelector(sel); if (!e) return null;
    const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)]; };
  return JSON.stringify({ sheet: r('.block.altering .rerollbox'), box: r('[data-editbox]'), save: r('[data-editdone]'),
    cancel: r('[data-editundo]'), vh: innerHeight, kbh: getComputedStyle(document.documentElement).getPropertyValue('--kbh').trim(),
    body: Math.round(document.body.getBoundingClientRect().height) }); })()`).then(JSON.parse);
const above = (w, floor) => ['sheet', 'box', 'save', 'cancel'].every((k) => w[k] && w[k][0] >= 0 && w[k][1] <= floor);

// ---- Android's keyboard: the page gets shorter
await page.mobile(390, 480); await wait(500);
const a = await altBox();
console.log("  android keyboard: " + JSON.stringify(a));
ok(`with Android's keyboard up, Alter's box, Save and Cancel are all above it (${JSON.stringify(a)})`, above(a, a.vh));
ok("  with nothing done for an iPhone, because the page already fits", a.kbh === '');
await page.mobile(390, 844); await wait(400);

// ---- an iPhone's keyboard: the page keeps its height and the visible part shrinks
await fakeVV(480); await wait(500);
const i = await altBox();
console.log("  iphone keyboard: " + JSON.stringify(i));
ok(`with an iPhone's keyboard up the page stops at its top (${i.kbh}, body ${i.body}px)`, i.kbh === '480px' && i.body === 480);
ok("  and Alter's box, Save and Cancel are all above it", above(i, 480));
await realVV(); await wait(400);
const back = await altBox();
ok(`when it goes, the page has its whole height again (${back.body} of ${back.vh})`, back.kbh === '' && back.body === back.vh);

// ---- the composer with an iPhone's keyboard over it
await page.eval("(() => { document.querySelector('[data-editdone]').click(); return 1; })()");
await wait(500);
await page.eval("(() => { const q = document.getElementById('quill'); if (q) q.click(); document.getElementById('input')?.focus(); return 1; })()");
await wait(400);
await fakeVV(480); await wait(500);
const box = await page.eval(`(() => { const h = document.getElementById('bar').getBoundingClientRect();
  const r = document.getElementById('input').getBoundingClientRect(), s = document.getElementById('send').getBoundingClientRect();
  return JSON.stringify({ header: [Math.round(h.top), Math.round(h.bottom)], box: [Math.round(r.top), Math.round(r.bottom)],
    send: Math.round(s.bottom) }); })()`).then(JSON.parse);
ok(`with the box up, the header stays at the top and the box and Send sit above an iPhone's keyboard (${JSON.stringify(box)})`,
   box.header[0] >= 0 && box.header[0] < 5 && box.box[1] <= 480 && box.send <= 480 && box.box[0] >= box.header[1]);
await realVV();

console.log(red ? `\n  ${red} RED` : "\n  all green");
