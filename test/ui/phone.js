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
await page.click("#page [data-open]");
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
// The ⋯ handle was removed on 2026-08-27; the double tap this scenario already proved works is
// the only door now.
await page.dbl("#col .block.newest .narr, #col .block.newest .said");
await wait(400);
const open = await trayBox();
ok(`a double tap opens a tray on a touch screen (${open ? Math.round(open.w) + "x" + Math.round(open.h) : "none"})`,
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
   /Reweave/.test(await page.text('.block[aria-expanded="true"] .acts') || ''));

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
await page.dbl("#col .block.newest .narr, #col .block.newest .said");   // ⋯ gone; double tap
await wait(300);
await page.click('.block[aria-expanded="true"] [data-hi]');
await wait(900);
ok("an action that repaints takes the backdrop down with the tray",
   (await trayBox()) === null && (await page.eval("document.documentElement.dataset.tray")) === '0');
ok("  and it did open Alterations", /Alterations/.test(await page.text('#sideHead') || ''));
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

// F34: a tap whose finger drifts is reclassified as a scroll and the click never arrives. Measured
// at 14px working and 24px dead before the recogniser existed; this is that number, fixed.
await page.goto(B + "/");
await wait(800);
// Count what the page actually receives, so "it opened" and "it opened twice" are distinguishable —
// the second is what would make a two-press confirmation delete something in one finger.
await page.eval(`(() => {
  // The number that matters is how many times the app OPENED a story, not how many click events the
  // document saw. Both exist at a drift near the threshold — the browser's and ours — and the guard's
  // whole job is that only one of them is acted on. Counting events would have called that a failure
  // and counting nothing would have called it a pass.
  window.__hits = 0;
  const real = window.fetch;
  window.fetch = (u, o) => { if (String(u).includes('/api/story?story=')) window.__hits++; return real(u, o); };
  return 1; })()`);
await page.tapDrift("#page [data-open]", 24);
await wait(1500);
const drifted = await page.eval("(() => ({ hits: window.__hits, blocks: document.querySelectorAll('.block').length }))()");
ok(`a tap that drifts 24px opens the story now (${drifted.blocks} blocks)`, drifted.blocks > 0);
// THE assertion this whole change waited on Seth for. One finger, one action.
ok(`  and the app opened it exactly once, not twice (${drifted.hits})`, drifted.hits === 1);

// 14px is the dangerous number, and it is the one this whole change waited on Seth for. The browser
// STILL fires click there — F34 measured 14px opening a story before the recogniser existed — and the
// recogniser fires too, because 14 is over its 10px floor. Both. That is the double, and on Delete
// take or Delete this story the second press is the deletion.
//
// 24px cannot test the guard: nothing native arrives there, so removing the guard leaves that case
// green. This one goes to two without it.
await page.goto(B + "/");
await wait(800);
await page.eval(`(() => { window.__hits = 0;
  const real = window.fetch;
  window.fetch = (u, o) => { if (String(u).includes('/api/story?story=')) window.__hits++; return real(u, o); };
  return 1; })()`);
await page.tapDrift("#page [data-open]", 14);
await wait(1500);
const both = await page.eval("(() => ({ hits: window.__hits, blocks: document.querySelectorAll('.block').length }))()");
ok(`  a 14px drift, where the browser fires too, is still ONE action (${both.hits})`, both.hits === 1);
ok("  and it opened the story", both.blocks > 0);

// A clean tap must still be exactly one, or the recogniser is doubling the ordinary case.
await page.goto(B + "/");
await wait(800);
await page.eval(`(() => { window.__hits = 0;
  const real = window.fetch;
  window.fetch = (u, o) => { if (String(u).includes('/api/story?story=')) window.__hits++; return real(u, o); };
  return 1; })()`);
await page.tapDrift("#page [data-open]", 0);
await wait(1500);
const clean = await page.eval("(() => ({ hits: window.__hits, blocks: document.querySelectorAll('.block').length }))()");
ok(`  a tap with no drift still opens it exactly once (${clean.hits})`, clean.hits === 1 && clean.blocks > 0);

// The regression Seth hit within minutes of the first version: "i cant scroll without opening
// something". A flick — a finger still travelling when it lifts — must never be a press, at ANY
// distance, because the old band caught every scroll that began on a card.
await page.goto(B + "/");
await wait(800);
await page.eval(`(() => { window.__opened = 0; const real = window.fetch;
  window.fetch = (u, o) => { if (String(u).includes('/api/story?story=')) window.__opened++; return real(u, o); };
  return 1; })()`);
// Two big steps and no pause: a finger travelling 12px at a time and gone. Six small ones with a
// pause is a slow drag that stopped, which is a press, and the app is right to treat it as one.
await page.tapDrift("#page [data-open]", 24, 0, 2);
await wait(1200);
ok("  a flick that lifts while still moving is never a press, even at a tapping distance",
   (await page.eval("window.__opened")) === 0);

// 45px, slowly, coming to rest. This is the gesture Seth described — an unhurried scroll that stops
// — and it is the one the first band got wrong: it settles, so the flick rule lets it through, and
// only the distance ceiling can refuse it. At 60px it opened a story. A press does not wander 45px.
await page.goto(B + "/");
await wait(800);
await page.eval(`(() => { window.__opened = 0; const real = window.fetch;
  window.fetch = (u, o) => { if (String(u).includes('/api/story?story=')) window.__opened++; return real(u, o); };
  return 1; })()`);
await page.tapDrift("#page [data-open]", 45);
await wait(1200);
// WHAT THIS DOES NOT PROVE. It stays green with the distance ceiling widened to 200 AND the scroll
// check deleted, so neither of those is what refuses this gesture — most likely the page scrolls
// under the finger and the release lands off the card, which the recogniser also refuses. It is a
// real regression test for the behaviour Seth reported and it is NOT a test of either guard.
//
// The guards that ARE falsified: the recogniser itself (24px, settled), the double-fire guard
// (14px, where the browser fires too), and the flick rule (two big steps, no pause). The distance
// ceiling and the scroll check are belt to those braces and neither is independently covered.
ok("  a slow 45px drag that comes to rest is a scroll, not a press",
   (await page.eval("window.__opened")) === 0);

// And a real scroll must still be a scroll. 80px of movement is a drag, not a fumbled press.
await page.goto(B + "/");
await wait(800);
await page.eval(`(() => { window.__hits = 0;
  const real = window.fetch;
  window.fetch = (u, o) => { if (String(u).includes('/api/story?story=')) window.__hits++; return real(u, o); };
  return 1; })()`);
await page.tapDrift("#page [data-open]", 80);
await wait(1200);
ok("  and 80px of movement is still a scroll, not a press",
   (await page.eval("window.__hits")) === 0);

// The menu is a full-screen sheet from the bottom, not a drawer from the left with the shelf
// showing beside it.
await page.goto(B + "/");
await wait(800);
await page.eval(`(() => { window.__opened = 0; const real = window.fetch;
  window.fetch = (u, o) => { if (String(u).includes('/api/story?story=')) window.__opened++; return real(u, o); };
  return 1; })()`);
// The web in the bar, not a hamburger — the hamburger was a second door to the same menu and is
// gone. If this selector ever stops matching, the phone has no way into the menu at all, which is
// worth a red rather than a skip.
await page.click("#bar [data-railview='workspace']");
await wait(700);
const sheet = await page.eval(`(() => { const r = document.getElementById('rail').getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y),
           vw: innerWidth, vh: innerHeight }; })()`);
ok(`the menu fills the screen (${sheet.w}x${sheet.h} of ${sheet.vw}x${sheet.vh})`,
   sheet.w >= sheet.vw && sheet.h >= sheet.vh && sheet.x === 0);

// Nothing behind it to reach. This is the structural answer to click-through: not a scrim that must
// catch the tap, but no exposed surface to tap at all.
// Sample the whole screen, not one point. The property is that NOTHING behind the sheet is exposed
// — and the middle of it is a menu item, so a tap there opening a story is the menu working rather
// than a leak. What must be true is that every point lands inside the sheet.
const exposed = await page.eval(`(() => {
  const out = [];
  for (const fx of [0.1, 0.5, 0.9]) for (const fy of [0.1, 0.5, 0.9]) {
    const el = document.elementFromPoint(Math.round(innerWidth * fx), Math.round(innerHeight * fy));
    if (!el || !el.closest('#rail')) out.push(\`\${fx},\${fy}:\${el ? (el.id || el.className || el.tagName) : 'null'}\`);
  }
  return out.join(' '); })()`);
ok(`  and nothing behind it is reachable anywhere on the screen (${exposed || 'nine of nine inside'})`,
   exposed === '');

// And it has to be closable, or a full-screen sheet is a trap.
await page.click("#rail [data-rail]");
await wait(700);
ok("  the chevron closes it again",
   (await page.eval("document.documentElement.dataset.uiRail")) === 'closed');

// The margin rules, read off the COMPUTED style rather than the class list — a class that names a
// rule nobody can see is the failure worth catching.
await page.goto(B + "/");
await wait(700);
await page.click("#page [data-open]");
await wait(1400);
const margins = await page.eval(`(() => {
  const blk = document.querySelector('#col .block');
  const last = document.querySelector('#col .block.newest');
  const c = blk ? getComputedStyle(blk) : null;
  const l = last ? getComputedStyle(last) : null;
  return { align: c ? c.textAlign : null, leftRule: c ? c.borderLeftWidth : null,
           rightRule: c ? c.borderRightWidth : null,
           // OUTLINE, not border: a border on the newest block moved the document 46px and broke
           // the running-head check in panels.js. An outline takes no space, so it decorates without
           // shifting anything — and this assertion has to measure the thing that is actually there.
           boxed: l ? parseFloat(l.outlineWidth) > 0 : null }; })()`);
ok(`nothing is mirrored to the right edge (align ${margins.align}, right rule ${margins.rightRule})`,
   margins.align !== 'right' && parseFloat(margins.rightRule || '0') === 0);
ok(`  and the last passage is boxed so the eye finds it (${margins.boxed})`, margins.boxed === true);

// There must be exactly one way into the menu, and it must be there on EVERY screen. The first
// version of this change put the control inside the in-story branch of the bar, so with the
// hamburger removed the shelf had no way to open the menu at all.
for (const [where, go] of [["the shelf", async () => { await page.goto(B + "/"); }],
                           ["a story", async () => { await page.goto(B + "/"); await wait(500);
                             await page.click("#page [data-open]"); }]]) {
  await go();
  await wait(1200);
  // AT LEAST ONE door to the MAIN menu, on every screen. This asked for exactly one until
  // 2026-08-28, when Seth said: "the maine menu moveing forward will be the anansi logo on the
  // left or the header of any main menu item." On a workspace page that is deliberately two — her
  // mark and the page's own title — so the count is no longer the rule. THE HOLE THIS GUARDS IS
  // ZERO, which is what happened the last time the control moved: the shelf had no way in at all.
  // Still counted specifically on the workspace door, because counting every rail control would
  // pass with the main menu missing and the story menu present twice.
  // THE RULE IS "YOU CAN REACH THE MAIN MENU FROM HERE", not "the header has a button". Seth,
  // 2026-08-29, took the word Anansi out of the header: on the shelf the header name still opens
  // the main menu in one tap, and INSIDE A STORY it is deliberately two — the story's name opens
  // the story menu, and the Anansi word at the top of that menu opens the main one. Counting header
  // doors called that zero and it is not; the path is walked instead, which is the thing that would
  // actually be broken if this regressed.
  let doors = await page.eval("document.querySelectorAll('#bar [data-railview=\"workspace\"]').length");
  if (!doors) {
    await page.click('#bar [data-railview="story"]');
    await wait(500);
    doors = await page.eval("document.querySelectorAll('#rail [data-home]').length");
  }
  ok(`  a way into the menu on ${where} (${doors})`, doors >= 1);
  const own = await page.eval("document.querySelectorAll('#bar [data-railview=\"story\"]').length");
  ok(`  and the story's own menu door is there only in a story (${own})`,
     own === (where === "a story" ? 1 : 0));
  ok(`  and no hamburger left on ${where}`, (await page.eval("!!document.getElementById('burger')")) === false);
}

// The menu's Threads page, on a phone. Same family as the report at the top of this file: the press
// worked, the thing it opened was off screen, and off screen is indistinguishable from broken. The
// split becomes a column on a phone, so the editor beside the list sits BELOW every book's threads.
await page.goto(B + "/");
await wait(700);
await page.eval("(() => { document.querySelector('[data-rail]').click(); return 1; })()");
await wait(500);
await page.click('[data-nav="canon"]');
await wait(1100);
const beads = await page.eval("document.querySelectorAll('#page [data-entry]').length");
ok(`the menu's Threads page lists threads on a phone (${beads})`, beads > 0);
const pid = await page.eval("document.querySelector('#page [data-entry]')?.dataset.entry");
await page.click('[data-entry="' + pid + '"]');
await wait(1200);
// The list is GONE, which is what puts the editor where a thumb already is. Checking only that the
// editor exists would pass with it a screenful below the fold, which is the bug.
// A CARD, not a form. It opens on its face now (PLAN-08): reading your own canon is the common
// act and editing it is the deliberate one. What this section is about has not changed — the list
// is GONE and the card is where a thumb already was — so the assertion follows the card rather
// than the body field it used to reach for.
ok("  tapping one puts the card where the list was",
   (await page.eval("document.querySelectorAll('#page [data-entry]').length")) === 0
   && (await page.eval("!!document.querySelector('#page [data-cardview]')")) === true);
const top = await page.eval("(() => { const el = document.querySelector('#page [data-cardview]');"
  + " return el ? Math.round(el.getBoundingClientRect().top) : 9999; })()");
ok(`  and it is on the screen, not below it (${top}px from the top)`, top < 700);
// And the form is one press away, on the same screen, still above the fold.
await page.click('#page [data-cardview="form"]');
await wait(700);
const ftop = await page.eval("(() => { const el = document.querySelector('#page [data-f=\"body\"]');"
  + " return el ? Math.round(el.getBoundingClientRect().top) : 9999; })()");
ok(`  and Edit reaches the body field without a scroll (${ftop}px from the top)`, ftop < 700);
await page.click('[data-backentry]');
await wait(900);
ok("  and Back returns to the list rather than to nothing",
   (await page.eval("document.querySelectorAll('#page [data-entry]').length")) > 0);

console.log(red ? `\n  ${red} RED` : "\n  all green");
