// A passage being edited on a phone, with the keyboard up.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/keyboard.js
//
// Seth, 2026-10-26: "once in the edit window a double tap shouldn't bring back the menu that comes
// up when you double tap when not in the edit screen and check how the bar and edit bars sit with
// a virtual keyboard on iphone."
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

// Into the edit: the last passage's tray, then Alter.
const id = await page.eval(`(() => { const b = [...document.querySelectorAll('#col .block')].filter((x) => x.querySelector('[data-ed]')).at(-1);
  b.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); return b.querySelector('[data-ed]').dataset.ed; })()`);
await wait(500);
await page.eval(`(() => { document.querySelector('[data-ed="${id}"]').click(); return 1; })()`);
await wait(500);
const editing = () => page.eval(`(() => { const el = document.querySelector('[data-edit="${id}"]');
  return !!el && el.isContentEditable && !!el.parentElement.querySelector('.altbar'); })()`);
const trayOpen = () => page.eval("!!document.querySelector('#col .block[aria-expanded=\"true\"]')");
ok("Alter puts the passage in its edit, with Save and Cancel under it", await editing());

// ---- a double tap in the edit selects a word, and opens nothing
await page.eval(`(() => { const el = document.querySelector('[data-edit="${id}"]');
  el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); return 1; })()`);
await wait(400);
ok("a double tap on the text being edited does not bring the menu back", !(await trayOpen()));
await page.eval(`(() => { const bar = document.querySelector('[data-edit="${id}"]').parentElement.querySelector('.altbar');
  bar.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); return 1; })()`);
await wait(400);
ok("  nor one beside Save and Cancel", !(await trayOpen()));
ok("  and the passage is still being edited", await editing());

const where = () => page.eval(`(() => { const r = (sel) => { const e = document.querySelector(sel); if (!e) return null;
    const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)]; };
  const bar = document.querySelector('[data-edit="${id}"]').parentElement.querySelector('.altbar').getBoundingClientRect();
  return JSON.stringify({ header: r('#bar'), dock: r('#dock'), altbar: [Math.round(bar.top), Math.round(bar.bottom)],
    vh: innerHeight, kbh: getComputedStyle(document.documentElement).getPropertyValue('--kbh').trim(),
    body: Math.round(document.body.getBoundingClientRect().height) }); })()`).then(JSON.parse);

// ---- Android's keyboard: the page gets shorter
await page.mobile(390, 480); await wait(500);
const a = await where();
console.log("  android keyboard: " + JSON.stringify(a));
ok(`with Android's keyboard up the header stays at the top (${a.header})`, a.header && a.header[0] >= 0 && a.header[0] < 5);
ok(`  Save and Cancel sit above the bar at the bottom (${a.altbar} over ${a.dock})`,
   a.altbar[1] <= Math.min(a.vh, a.dock ? a.dock[0] : a.vh) && a.altbar[0] >= (a.header ? a.header[1] : 0));
ok(`  and the bar sits on the keyboard (${a.dock} of ${a.vh})`, !a.dock || a.dock[1] <= a.vh);
ok("  with nothing done for an iPhone, because the page already fits", a.kbh === '');
await page.mobile(390, 844); await wait(400);

// ---- an iPhone's keyboard: the page keeps its height and the visible part shrinks
await page.eval(`(() => { window.__realVV = window.visualViewport;
  Object.defineProperty(window, 'visualViewport', { configurable: true,
    value: { height: 480, width: 390, scale: 1, offsetTop: 0, offsetLeft: 0, addEventListener() {} } });
  window.dispatchEvent(new Event('resize')); return 1; })()`);
await wait(500);
const i = await where();
console.log("  iphone keyboard: " + JSON.stringify(i));
ok(`with an iPhone's keyboard up the page stops at its top (${i.kbh}, body ${i.body}px)`, i.kbh === '480px' && i.body === 480);
ok(`  the header stays at the top (${i.header})`, i.header && i.header[0] >= 0 && i.header[0] < 5);
ok(`  Save and Cancel are above the keyboard and the bar (${i.altbar}, bar ${i.dock})`,
   i.altbar[1] <= Math.min(480, i.dock ? i.dock[0] : 480) && i.altbar[0] >= (i.header ? i.header[1] : 0));
ok(`  and the bar sits on the keyboard, not under it (${i.dock} of 480)`, !i.dock || i.dock[1] <= 480);

// And the keyboard going away gives the page its height back.
await page.eval(`(() => { Object.defineProperty(window, 'visualViewport', { configurable: true, value: window.__realVV });
  window.dispatchEvent(new Event('resize')); return 1; })()`);
await wait(400);
const back = await where();
ok(`when it goes, the page has its whole height again (${back.body} of ${back.vh})`, back.kbh === '' && back.body === back.vh);

// ---- the bar with the box up and the keyboard over it (an iPhone)
await page.eval(`(() => { document.querySelector('[data-edit="${id}"]').blur(); return 1; })()`);
await wait(600);
await page.eval("(() => { const q = document.getElementById('quill'); if (q) q.click(); document.getElementById('input')?.focus(); return 1; })()");
await wait(400);
await page.eval(`(() => { Object.defineProperty(window, 'visualViewport', { configurable: true,
    value: { height: 480, width: 390, scale: 1, offsetTop: 0, offsetLeft: 0, addEventListener() {} } });
  window.dispatchEvent(new Event('resize')); return 1; })()`);
await wait(500);
const box = await page.eval(`(() => { const r = document.getElementById('input').getBoundingClientRect();
  const s = document.getElementById('send').getBoundingClientRect();
  return JSON.stringify({ box: [Math.round(r.top), Math.round(r.bottom)], send: Math.round(s.bottom) }); })()`).then(JSON.parse);
ok(`with the box up, the box and Send sit above an iPhone's keyboard (${JSON.stringify(box)})`,
   box.box[1] <= 480 && box.send <= 480 && box.box[0] >= 0);
await page.eval(`(() => { Object.defineProperty(window, 'visualViewport', { configurable: true, value: window.__realVV });
  window.dispatchEvent(new Event('resize')); return 1; })()`);

console.log(red ? `\n  ${red} RED` : "\n  all green");
