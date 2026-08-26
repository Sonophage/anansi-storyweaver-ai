// A phone, with a touch screen and no mouse.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/phone.js
//
// This exists because "clicking on a story wasn't opening the story" on Android was unreproducible:
// the driver had only ever had a mouse, so hover rules applied and a tap was a click with a hover
// before it. Everything below is a finger.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (m, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${m}${cond ? "" : "   <-- broken"}`); if (!cond) red++; };

await page.mobile();
await page.goto(B + "/");
await wait(900);

// The premise: this is a phone as far as CSS and matchMedia are concerned. If either half of the
// emulation is off, every assertion below tests the desktop surface and passes for the wrong reason.
ok("the page believes it is a phone", (await page.eval("matchMedia('(max-width:719px)').matches")) === true);
ok("  and that it has no mouse", (await page.eval("matchMedia('(hover:none)').matches")) === true);

const cards = await page.eval("document.querySelectorAll('[data-open]:not([data-open=\"new\"])').length");
ok(`the shelf has a story to tap (${cards})`, cards >= 1);

const before = await page.eval("(() => document.querySelector('#page')?.innerHTML.length ?? 0)()");
await page.click("#page .storycard[data-open]");
await wait(1400);

// The bug, stated as the thing that must be true: tapping a card opens that story.
const opened = await page.eval("(() => ({"
  + " place: document.querySelector('#read') ? 'has-read' : 'no-read',"
  + " title: document.querySelector('#bar')?.textContent?.trim().slice(0, 60) ?? '',"
  + " blocks: document.querySelectorAll('.block').length,"
  + " toast: document.querySelector('#toast')?.textContent?.trim() ?? '' }))()");
ok(`tapping a story on the shelf opens it (blocks=${opened.blocks}, bar="${opened.title}")`,
   opened.blocks > 0);
ok(`  and nothing was toasted instead ("${opened.toast}")`, !opened.toast);

// Reading mode, on the surface where it matters: a finger, and CSS that actually applies.
await page.click("[data-readmode]");
await wait(400);
ok("the reading button turns reading mode on",
   (await page.eval("document.documentElement.dataset.reading")) === '1');
// Faded, not unmounted — the draft in the textarea has to survive turning it off again.
const dock = await page.eval("(() => { const d = document.querySelector('#dock');"
  + " const s = getComputedStyle(d); return { op: parseFloat(s.opacity), pe: s.pointerEvents,"
  + "   there: !!d.querySelector('textarea') }; })()");
ok(`  the composer fades rather than leaving (opacity ${dock.op}, pointer-events ${dock.pe})`,
   dock.op < 0.3 && dock.pe === 'none' && dock.there === true);
ok("  and the prose stops taking taps",
   (await page.eval("getComputedStyle(document.querySelector('#col .block')).pointerEvents")) === 'none');
// The button has to be able to give it back, or reading mode is a trap on a touch device.
await page.click("[data-readmode]");
await wait(400);
ok("  and the same button gives the composer back",
   (await page.eval("document.documentElement.dataset.reading")) === '0'
   && (await page.eval("parseFloat(getComputedStyle(document.querySelector('#dock')).opacity)")) > 0.9);

console.log(red ? `\n  ${red} RED` : "\n  all green");
