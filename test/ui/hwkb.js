// The hardware-keyboard setting: does the mechanism it depends on actually hold?
//
// Reported 2026-08-28: "when the hardware keyboard option was selected before, the input box would
// not move since it didn't need to move to make space for the keyboard. This behaviour has been
// reverted incorrectly."
//
// The reflow itself cannot be reproduced here — headless Chrome has no soft keyboard, so no widget
// resizes the layout viewport and there is nothing to move. What CAN be checked is the whole
// mechanism the setting is: `interactive-widget` in the viewport meta, which is the one thing that
// tells the browser not to resize for a keyboard that is not there. If that is right and the box
// still moves on a real phone, the cause is somewhere else and this scenario says so by passing.
//
//   test/ui/run.sh hwkb
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (l, g) => { if (!g) red++; console.log("  " + (g ? "ok  " : "RED ") + l); };

const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s=>s.title==='The Silver Key').id)()");
await page.mobile();
await page.goto(B + "/#" + sid);
for (let i = 0; i < 40 && !(await page.visible('#send')); i++) await wait(250);

const widget = () => page.eval("(() => (document.querySelector('meta[name=\"viewport\"]')?.getAttribute('content') || '').match(/interactive-widget=([a-z-]+)/)?.[1] ?? 'absent')()");
const stored = () => page.eval("(() => { try { return localStorage.getItem('anansi.hwkb'); } catch { return 'no storage'; } })()");

ok(`the viewport meta declares an interactive-widget mode (${await widget()})`, (await widget()) !== 'absent');
ok(`  and with the setting off it is resizes-content (${await widget()})`, (await widget()) === 'resizes-content');

// Turn it on the way the writer does — through the themes menu, not by calling setHwkb.
await page.eval("(() => { document.documentElement.dataset.uiRail = 'closed'; return 1; })()");
await page.eval("(() => { const b = document.querySelector('[data-appearance]'); if (b) b.click(); return 1; })()");
await wait(400);
// IT LIVES IN THE UI TAB NOW AND NOWHERE ELSE. It used to sit in a "This device" footer under
// EVERY tab, so a setting that is not about appearance at all appeared below the themes, the
// fonts and the sizes alike. Both directions asserted, because "moved it" is only half a claim:
// present under UI, absent under the other three.
const tabs = await page.eval("[...document.querySelectorAll('[data-looktab]')].map(b => b.dataset.looktab)");
console.log("  tabs: " + JSON.stringify(tabs));
ok("the themes menu still has its four tabs", tabs.length === 4);
for (const t of tabs) {
  await page.eval(`(() => { document.querySelector('[data-looktab="${t}"]')?.click(); return 1; })()`);
  await wait(300);
  const here = await page.eval("!!document.querySelector('[data-hwkb]')");
  ok(`  hardware keyboard ${t === 'scale' ? 'IS' : 'is not'} on the ${t} tab`, here === (t === 'scale'));
}
await page.eval("(() => { document.querySelector('[data-looktab=\"scale\"]')?.click(); return 1; })()");
await wait(300);
const toggle = await page.eval("!!document.querySelector('[data-hwkb]')");
ok("the hardware-keyboard toggle is reachable from the UI tab", toggle);
if (toggle) {
  await page.eval("(() => { document.querySelector('[data-hwkb]').click(); return 1; })()");
  await wait(400);
  ok(`pressing it stores the setting (${await stored()})`, (await stored()) === '1');
  // THE MECHANISM. overlays-content is what says "do not resize the layout for a widget"; without
  // it the dock moves every time Android reports a suggestion strip or a keyboard flickering away.
  ok(`  and the viewport switches to overlays-content (${await widget()})`,
     (await widget()) === 'overlays-content');

  // AND IT HAS TO SURVIVE A REPAINT. applyHwkb() runs once at module load and once per press;
  // nothing re-applies it afterwards. If any repaint rewrote the meta, the setting would be on in
  // storage, shown as on in the menu, and doing nothing at all — which is exactly the shape of the
  // report.
  await page.eval("(() => { document.querySelector('[data-appearance]')?.click(); return 1; })()");
  await wait(300);
  await page.eval("(() => { document.querySelector('[data-mode=\"speak\"]')?.click(); return 1; })()");
  await wait(400);
  ok(`  and it survives repaints — still overlays-content after two (${await widget()})`,
     (await widget()) === 'overlays-content');

  // THE HALF THE META CANNOT DO, and the one Seth actually reported: "it's only when I press the
  // input button that it moves." `interactive-widget` says what happens to the layout WHEN a soft
  // keyboard appears; it does not stop one appearing, and on Android a tap on a text field always
  // opens one whether or not a physical keyboard is attached. The browser then scrolls to keep the
  // caret above it, and that scroll IS the movement. `inputmode="none"` is the only thing that
  // says do not raise a virtual keyboard for this field.
  const im = () => page.eval("(() => document.getElementById('input')?.getAttribute('inputmode') ?? 'absent')()");
  ok(`with the setting on, the composer refuses an on-screen keyboard (inputmode=${await im()})`,
     (await im()) === 'none');
  // It has to survive a repaint too — the textarea is rebuilt by drawDock on nearly every action,
  // and an attribute set once would last until the first one.
  await page.eval("(() => { document.querySelector('[data-mode=\"act\"]')?.click(); return 1; })()");
  await wait(400);
  ok(`  and it is still there after the composer is redrawn (inputmode=${await im()})`,
     (await im()) === 'none');
  // And OFF has to mean off, or a writer with no physical keyboard would have nothing to type with.
  await page.eval("(() => { document.querySelector('[data-appearance]')?.click(); return 1; })()");
  await wait(300);
  await page.eval("(() => { document.querySelector('[data-looktab=\"scale\"]')?.click(); return 1; })()");
  await wait(300);
  await page.eval("(() => { document.querySelector('[data-hwkb]')?.click(); return 1; })()");
  await wait(400);
  ok(`turning it off gives the on-screen keyboard back (inputmode=${await im()})`,
     (await im()) === 'absent');

  // The one place the app itself moves focus for this setting: with a hardware keyboard and
  // nothing focused, the caret comes back to the box. preventScroll on both focus calls, because
  // focus() otherwise scrolls the element into view and yanks the reading column — which is the
  // "input box moves" this was reported as the first time.
  const src = await page.eval("(async () => (await (await fetch('/web/app.js')).text()))()");
  const focuses = [...src.matchAll(/ta\.focus\(([^)]*)\)/g)].map((m) => m[1]);
  console.log("  ta.focus calls: " + JSON.stringify(focuses));
  ok(`every composer focus() passes preventScroll (${focuses.length} calls)`,
     focuses.length > 0 && focuses.every((a) => /preventScroll:\s*true/.test(a)));
}

console.log(red ? `\n  ${red} RED` : "\n  all green");
