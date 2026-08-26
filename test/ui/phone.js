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
ok("  the composer is gone, not dimmed",
   (await page.eval("getComputedStyle(document.querySelector('#dock')).display")) === 'none');
ok("  and the prose stops taking taps",
   (await page.eval("getComputedStyle(document.querySelector('#col .block')).pointerEvents")) === 'none');
// The button has to be able to give it back, or reading mode is a trap on a touch device.
await page.click("[data-readmode]");
await wait(400);
ok("  and the same button gives the composer back",
   (await page.eval("document.documentElement.dataset.reading")) === '0'
   && (await page.eval("getComputedStyle(document.querySelector('#dock')).display")) !== 'none');

// Type half a line, leave reading mode and come back: it has to still be there.
//
// What this does NOT prove: that the draft is held in state. Breaking drawDock's rehydration
// (`if (draft?.text)`) leaves this check green, because `display:none` removes the composer from the
// layout and from the tab order but NOT from the DOM — the textarea and its value are still sitting
// there. So this asserts the guarantee a writer cares about and nothing about the mechanism, and
// the day the composer is genuinely unmounted it will stop being green for free.
await page.type("#dock textarea", "half a sentence that must survive");
await wait(200);
await page.click("[data-readmode]");
await wait(400);
ok("  and a half-written line survives the round trip",
   (await page.eval("document.querySelector('#dock')") === null
    || (await page.eval("getComputedStyle(document.querySelector('#dock')).display")) === 'none'));
await page.click("[data-readmode]");
await wait(500);
const kept = await page.eval("document.querySelector('#dock textarea')?.value ?? ''");
ok(`  the draft came back ("${kept.slice(0, 34)}")`, kept === "half a sentence that must survive");

console.log(red ? `\n  ${red} RED` : "\n  all green");
