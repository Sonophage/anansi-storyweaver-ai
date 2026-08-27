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

// ---- the ⋯ tray, as a sheet in the middle of the screen
//
// It used to open AT the block: absolute, right:0, top:-22px, and on a phone in the flow underneath
// as unlabelled icons. So Edit, Regenerate and Delete arrived wherever the tapped paragraph happened
// to be — at the bottom edge of it, off the side of the column, low on the screen if the paragraph
// was low on the screen. Centred, every paragraph's tray is the same reach.
const centre = await page.eval("(() => ({ x: innerWidth / 2, y: innerHeight / 2 }))()");
const trayBox = async () => page.eval("(() => { const e = document.querySelector('.block[aria-expanded=\"true\"] .acts');"
  + " if (!e) return null; const r = e.getBoundingClientRect();"
  + " return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; })()");

// The NEWEST block on purpose. It carries `animation:rise ... both`, and a filled transform
// animation makes the element the containing block for a position:fixed child — so the sheet
// centred on that paragraph rather than on the screen, on exactly the block a writer has just
// generated and is most likely to reach for. The first block has no animation and passes either way.
ok("there is a newest block to open the tray on",
   (await page.eval("document.querySelectorAll('#col .block.newest').length")) === 1);
ok("no tray is open to begin with", (await trayBox()) === null);
await page.click("#col .block.newest .more");
await wait(400);
const open = await trayBox();
ok(`the ⋯ handle opens a tray on a touch screen (${open ? Math.round(open.w) + "x" + Math.round(open.h) : "none"})`,
   !!open && open.w > 0 && open.h > 0);
// The assertion that the position is the fix: within 40px of the middle in both axes. The old tray
// sat at the block, which on this 390x844 viewport is nowhere near it.
ok(`  and it is centred over the content (${open ? Math.round(open.x) + "," + Math.round(open.y) : "-"}`
   + ` against ${Math.round(centre.x)},${Math.round(centre.y)})`,
   !!open && Math.abs(open.x - centre.x) < 40 && Math.abs(open.y - centre.y) < 40);
ok("  with the scrim behind it, taking taps",
   (await page.eval("document.documentElement.dataset.tray")) === '1'
   && (await page.eval("getComputedStyle(document.querySelector('#scrim')).pointerEvents")) === 'auto');
// Icons only was a consequence of the tray being a floating strip. A sheet has the room, and four
// unlabelled glyphs one of which is Delete is not a menu.
ok("  and the actions are named, not four glyphs",
   /Regenerate/.test(await page.text('.block[aria-expanded="true"] .acts') || ''));

// A tap on the scrim shuts it. The scrim serves the rail too, so this is also the check that the
// tray gets it first — closing the rail instead would leave the sheet up over the content.
//
// NOT page.click('#scrim'): the scrim fills the viewport, so its centre is exactly where the sheet
// is, and a tap at the centre of the scrim presses a button ON the sheet. It did — History, which
// repaints, which shuts the tray, which made this assertion pass for entirely the wrong reason and
// broke every check after it. Tap high instead, over the bar, where only the scrim is.
const tapBackdrop = async () => { await page.touchDrift(centre.x, 60, 0); await wait(400); };
const panelWas = await page.eval("document.querySelector('#side').hidden");
await tapBackdrop();
ok("tapping the backdrop shuts the tray", (await trayBox()) === null
   && (await page.eval("document.documentElement.dataset.tray")) === '0');
ok("  and pressed nothing on the sheet on the way",
   (await page.eval("document.querySelector('#side').hidden")) === panelWas
   && !(await page.text('#toast')));

// A repaint rebuilds #col and takes every open tray with it, so the backdrop has to go with them —
// a backdrop over a page with nothing modal on it is a page that has stopped answering. History is
// the shortest action in the tray that repaints.
await page.click("#col .block.newest .more");
await wait(300);
await page.click('.block[aria-expanded="true"] [data-hi]');
await wait(900);
ok("an action that repaints takes the backdrop down with the tray",
   (await trayBox()) === null && (await page.eval("document.documentElement.dataset.tray")) === '0');
ok("  and it did open History", /History/.test(await page.text('#sideHead') || ''));
await page.click('[data-panel=""]');
await wait(400);

// ---- a double tap on the paragraph itself
// A second way in, not a replacement for the handle: the paragraph is a target the size of the
// paragraph. It is a dblclick rather than anything built on the delegated click handler, because
// F34's drift defect is unfixed and nothing new may depend on a single tap arriving.
await page.dbl("#col .block.newest [data-edit]");
await wait(400);
const dbl = await trayBox();
ok(`a double tap on a passage opens its tray (${dbl ? "open" : "nothing happened"})`, !!dbl);
ok("  and it is the tray of the paragraph that was tapped",
   await page.eval("(() => { const b = document.querySelector('.block[aria-expanded=\"true\"]');"
     + " return !!b && !!b.querySelector('[data-edit]'); })()"));
// The sheet is modal, which is why the backdrop is the way out of it and a second double tap on the
// paragraph is not: the paragraph is behind the backdrop by then. Asserted at three points of the
// paragraph's own box rather than assumed — a backdrop that does not take the taps is a sheet you
// can tap straight through, and the tap would land on the prose it is covering.
ok("  and the prose underneath cannot be reached while it is open",
   await page.eval("(() => { const e = document.querySelector('#col .block.newest [data-edit]');"
     + " const r = e.getBoundingClientRect();"
     + " return [[r.x + 4, r.y + 4], [r.x + r.width / 2, r.y + r.height / 2], [r.right - 4, r.bottom - 4]]"
     + "   .every(([x, y]) => { const t = document.elementFromPoint(x, y); return !!t && t !== e && !e.contains(t); }); })()"));
await tapBackdrop();
ok("  and the backdrop is what shuts it", (await trayBox()) === null
   && (await page.eval("document.querySelector('#side').hidden")) === panelWas);

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

// Tapping the prose must not start editing. Every passage used to carry contenteditable at all
// times, so on a phone a tap in a paragraph put a caret in it and raised the keyboard — editing
// nobody asked for, and the reason a stray thumb could rewrite a line.
const editableAtRest = await page.eval(
  "document.querySelectorAll('#col [data-edit][contenteditable]').length");
ok(`no passage is editable until you say so (${editableAtRest} editable at rest)`, editableAtRest === 0);

// The door is Edit, reached through the tray, which is reached by double tap. Open it the way a
// finger would.
await page.dbl("#col .block .narr, #col .block .said");
await wait(400);
const trayUp = await page.eval("document.querySelectorAll('.acts button[data-ed]').length");
ok(`a double tap opens the tray with Edit in it (${trayUp} found)`, trayUp > 0);
await page.click(".acts button[data-ed]");
await wait(500);
const afterEdit = await page.eval(
  "document.querySelectorAll('#col [data-edit][contenteditable]').length");
ok(`pressing Edit makes exactly one passage editable (${afterEdit})`, afterEdit === 1);

// And the browser must not treat a scroll-up as a page refresh.
ok("the reading pane keeps the pull-to-refresh gesture to itself",
   (await page.eval("getComputedStyle(document.getElementById('read')).overscrollBehaviorY")) === 'contain');

console.log(red ? `\n  ${red} RED` : "\n  all green");
