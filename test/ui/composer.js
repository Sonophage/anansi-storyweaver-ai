// Issues #3, #4 and #6, all reported from a phone on 2026-08-28 and all measured here rather than
// eyeballed. Every one of the three is a number the browser can be asked for.
//
//   test/ui/run.sh composer
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (l, g) => { if (!g) red++; console.log("  " + (g ? "ok  " : "RED ") + l); };

const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s=>s.title==='The Silver Key').id)()");
await page.mobile();
await page.goto(B + "/#" + sid);
for (let i = 0; i < 40 && !(await page.visible('#send')); i++) await wait(250);

// ---- THE COMPOSER ROW STAYS ON ONE LINE (2026-08-28). Three buttons sit right of the four modes
// now — this book's Threads, + Thread, and Anansi — and a third one pushed Anansi onto a second
// row at 390px. The row getting taller MOVES THE DOCK, which this project has three separate bug
// reports about, so the row's column-gap closes on a phone rather than the row growing — 22px was
// chosen when it held six things and it holds seven now.
//
// Measured as HEIGHT against a button, not as equal tops: the buttons do not share a top edge even
// on one line, because the row is not stretch-aligned and they are not all the same height. A tops
// check reported two rows on a row that was plainly one.
{
  const row = await page.eval(`(() => { const r = document.querySelector('#modes');
    if (!r) return null; const kids = [...r.children];
    return { h: Math.round(r.getBoundingClientRect().height),
             tallest: Math.max(...kids.map(b => Math.round(b.getBoundingClientRect().height))),
             labels: kids.map(b => b.textContent.trim()).join('|'), vw: innerWidth }; })()`);
  console.log("  modes row: " + JSON.stringify(row));
  ok(`the composer row is one line at phone width (${row && row.h}px of a ${row && row.tallest}px button)`,
     !!row && row.h < row.tallest * 1.6);
  // THE ROW IS FOUR CONTROLS NOW, not seven: the mode dial, the name beside it, Hold back, and the
  // thread doors as one dial. It was four modes and three doors on 2026-08-28, then the doors went
  // to two when Anansi came off the row, and on 2026-09-02 the four became one select and the two
  // doors another. Asserted as an ABSENCE too, or "they moved" would pass with them still here.
  ok(`  and both thread doors are on one dial beside the modes (${row && row.labels})`,
     !!row && /Threads/.test(row.labels) && /View Threads/.test(row.labels)
     && /Add Threads/.test(row.labels));
  ok("  with the four modes on a dial of their own", !!row && /Speak/.test(row.labels)
     && /Narrate/.test(row.labels));
  ok("  with Anansi no longer among them", !!row && !/Anansi/.test(row.labels));
}

// ---- #3. "The send button and the expand input button are too small."
//
// 44px is the floor every touch guideline agrees on, and this project has its own evidence for
// why: F34 measured that a press drifting 24px is one this surface can already lose, so a target
// smaller than a fingertip makes that drift the rule rather than the exception.
const box = (sel) => page.eval(`(() => { const e = document.querySelector('${sel}');
  if (!e) return null; const r = e.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left),
           right: Math.round(r.right) }; })()`);

// THE SHORT SIDE AND THE AREA, not "44 square". The buttons are vertical rectangles now — 38x56
// on a phone — and 44-square was never the point: the floor exists because F34 measured that a
// press drifting 24px is one this surface loses, so what matters is that a fingertip lands inside
// the shape. 38 across with 56 of height is half again the area of a 44 square. The short side
// keeps a floor of its own so "rectangle" cannot become "strip".
for (const [what, sel] of [["send", "#send"], ["the expand button", "#inputRow [data-bigin]"]]) {
  const b = await box(sel);
  if (!b) { ok(`${what} is on the page`, false); continue; }
  console.log(`  ${what}: ${JSON.stringify(b)}`);
  ok(`${what} has a fingertip's worth of target on a phone (${b.w}x${b.h} = ${b.w * b.h}px²)`,
     Math.min(b.w, b.h) >= 36 && b.w * b.h >= 44 * 44);
}

// THE BOX MATCHES THE BUTTONS BESIDE IT. It was one line tall — 24px against a 44px Send — so the
// row read as a stripe with two discs on the end, and the first character typed changed its
// height. Asserted as agreement with Send rather than as a number, because what was wrong was the
// disagreement and a fixed number would need rewriting the next time the target size moves.
{
  const inp = await box('#input');
  const send = await box('#send');
  console.log(`  #input ${JSON.stringify(inp)}  #send ${JSON.stringify(send)}`);
  ok(`the input box is as tall as the buttons beside it (${inp && inp.h} vs ${send && send.h})`,
     !!inp && !!send && Math.abs(inp.h - send.h) <= 2);
  // And typing one line must not change it, which is the half Seth reported: "clicking the input
  // box keeps it where i need it but once i start typing it moves."
  await page.eval("(() => { const t = document.getElementById('input'); t.value = 'a line'; t.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()");
  await wait(250);
  const after = await box('#input');
  ok(`  and typing a line does not move it (${inp && inp.h} then ${after && after.h})`,
     !!after && Math.abs(after.h - inp.h) <= 1);
  await page.eval("(() => { const t = document.getElementById('input'); t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()");
  await wait(200);
}

// AND THE GLYPH INSIDE IT, which is a different measurement and the one that was wrong. The box
// went to 44px and the arrow stayed 13px, because the button carried `font-size:13px` INLINE and
// an inline style beats a stylesheet — the rule was written and never applied. Seth: "the expand
// button however is still very very small. The icon at least is very very small." A tap target
// says where you can press; the glyph is what tells you it is there at all.
// ASSERTED AS AGREEMENT WITH SEND, not against a number. The number was a proxy for "legible",
// picked when the glyph was 13px inside a box with no size at all; the requirement now is Seth's
// own — "the maximize button can we style it the same as the send button" — and a fixed threshold
// would have to be rewritten every time either one moves. Both still have to be big enough to
// see, so the floor stays, low and honest.
const pair = await page.eval(`(() => {
  const g = (sel) => { const e = document.querySelector(sel); if (!e) return null;
    const s = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return { size: Math.round(parseFloat(s.fontSize)), bg: s.backgroundColor, color: s.color,
             radius: s.borderRadius, w: Math.round(r.width), h: Math.round(r.height) }; };
  return { send: g('#send'), big: g('#inputRow [data-bigin]') };
})()`);
console.log("  send/expand: " + JSON.stringify(pair));
ok("both buttons are on the page", !!pair.send && !!pair.big);
ok(`  the expand button is the same size as Send (${pair.big?.w} vs ${pair.send?.w})`,
   pair.big?.w === pair.send?.w);
ok(`  the same fill and the same shape (${pair.big?.bg})`,
   pair.big?.bg === pair.send?.bg && pair.big?.radius === pair.send?.radius);
// VERTICAL RECTANGLES, not discs, and the glyph in the fill's own ink. That last one is the
// second time an inline `color:var(--faint)` on this exact button beat a stylesheet and left the
// arrow grey inside a gold plate — asserted now rather than looked at.
ok(`  taller than they are wide (${pair.big?.w}x${pair.big?.h})`, (pair.big?.h ?? 0) > (pair.big?.w ?? 0));
ok(`  and the glyph wears the fill's own ink, not a grey (${pair.big?.color})`,
   pair.big?.color === pair.send?.color);
// BOTH ARE DRAWN MARKS NOW, from web/model.js's own set, rather than characters scavenged out of
// Unicode. The maximize wears what Threads used to wear and Send wears what Preferences did, and
// the menu took new ones — so the check is that each button holds an svg, not which glyph it is.
const svgs = await page.eval("(() => ({ send: !!document.querySelector('#send svg'),"
  + " big: !!document.querySelector('#inputRow [data-bigin] svg'),"
  + " chars: (document.querySelector('#send')?.textContent || '').trim().length }))()");
console.log("  icons: " + JSON.stringify(svgs));
ok("both buttons carry a drawn mark, not a text glyph", svgs.send && svgs.big && svgs.chars === 0);
ok(`  and still big enough to read (${pair.big?.size}px)`, (pair.big?.size ?? 0) >= 16);

// ---- #4. "The act as or speak as row doesn't reach the edges on the left or the right."
//
// The strip was inset three times over — the dock's 18px, then #asRow's 18, then .inner's 18 —
// so it sat 54px in while the mode rail under it sat at 18. Asserted as ALIGNMENT with #modes
// rather than as a pixel count, because what was wrong was the disagreement between the two, and
// a fixed number here would have to be rewritten the next time the dock's padding changes.
await page.mode('speak');
await wait(500);
// Measured on the TEXT, not on `.inner`'s box. The first version compared `.inner`'s bounding
// rect against #modes and stayed green when the padding was put back — because an element's own
// padding is inside its box, so `.inner`'s rect never moved. What a reader sees not reaching the
// edge is the label and the name, and those are what the padding pushes in.
// THE STRIP IS GONE, and with it the inset it was measured against: the name is the second control
// in the rail now, so there is no second row to line up with the first. What is still worth
// measuring is that the name has not been pushed off the row — the reason it was moved OUT of the
// rail on 2026-08-27 was that a long name ran out of space at the right-hand end of seven controls.
// The rail has four, and the name sits second, where there is room.
const dialBox = await box("[data-modesel]");
const sel = await box("#asWhom");
const modes = await box("#modes");
if (!dialBox || !sel || !modes) {
  ok("the mode dial and the name beside it are both on screen", false);
} else {
  console.log(`  dial ${JSON.stringify(dialBox)}  name ${JSON.stringify(sel)}  modes ${JSON.stringify(modes)}`);
  ok(`the dial starts at the row's own left edge (${dialBox.left} vs ${modes.left})`,
     Math.abs(dialBox.left - modes.left) <= 1);
  ok(`  and the name follows it rather than being pushed off the row (${sel.left} vs ${dialBox.right})`,
     sel.left >= dialBox.right && sel.right <= modes.right + 1);
}

// ---- #6. "The anansi logo on dark themes has a white background."
//
// The mark is inline SVG now rather than an <img> of a file with #0A0A0C baked behind it, so it
// has no plate of its own and its stroke follows the theme. Both halves asserted: nothing opaque
// painted behind it, and the stroke actually changing when the theme does.
await page.eval("(() => { document.documentElement.dataset.uiRail = 'open'; return 1; })()");
await wait(300);
const logo = await page.eval(`(() => {
  const svg = document.querySelector('#rail svg');
  if (!svg) return null;
  const cs = getComputedStyle(svg);
  const g = svg.querySelector('g');
  return { tag: svg.tagName, bg: cs.backgroundColor,
           stroke: g ? getComputedStyle(g).stroke : null,
           img: !!document.querySelector('#rail img') };
})()`);
console.log("  logo: " + JSON.stringify(logo));
// Written so a MISSING svg is a red rather than a throw: the first version read
// svg.querySelector('g') unguarded, and reverting the fix on purpose KILLED the scenario at four
// checks instead of failing three, which run.sh scores as never having reached its verdict.
ok("the logo is inline SVG, not an <img> carrying its own background", !!logo && !logo.img);
ok(`  and paints no plate behind itself (${logo && logo.bg})`,
   !!logo && /rgba\(0, 0, 0, 0\)|transparent/.test(logo.bg));

// Asserted against the TOKEN rather than by switching themes. The first version set
// `data-ui-theme` and compared two strokes; it went red, and the detector was the thing that was
// wrong — a theme is applied by `themeVars` writing CSS variables onto :root (web/model.js:284),
// not by an attribute selector, so setting the attribute alone changes nothing. What matters is
// that the stroke resolves to the theme's own accent instead of the file's baked #D9B26A, and
// that is checkable in one place with no theme switch at all.
// ISSUE #6's CHECK IS RETIRED WITH ITS SUBJECT. It asserted that the inline mark's stroke resolved
// to the theme's --gold rather than to the hex baked into web/icon.svg — which was the whole of #6.
// Seth removed the mark from the main menu on 2026-08-29 and then the word that replaced it from
// the header, so there is no longer an element whose colour comes from that file at all: the risk
// is gone rather than untested. web/icon.svg stays as the favicon and the installed icon, where an
// opaque plate is correct and no page shows through behind it.
//
// Not replaced with a selector hunted until it passed. The themes themselves are covered in
// test/app.ts, which derives every token from one row per theme and asserts the contrast.

// ---- FULL SCREEN MEANS FULL SCREEN (decided 2026-08-28, PLAN-07).
//
// Both of these were already fixed to all four edges and neither read as a screen, because you
// could see the page through them. `#appearance` carried the desk card's rgba(16,15,18,.97) into
// the full-screen rule — 3% of the prose behind a blur, and a hardcoded Obsidian colour on a rule
// the other eight themes share. `#dock.big` inherited `--dock`, which is a gradient fading from
// nothing to 92% of the paper: right for a composer floating over prose, wrong for one that IS the
// screen. Issue #8: "the background behind the input should be completely opaque. It is currently
// not opaque which makes it hard to read anything." (This block said #3 until 2026-08-28. #3 is
// the button-size report asserted at the top of this file; the opacity one is #8, and the wrong
// number had been copied into app.html as well.)
//
// #dock.big has since gone the other way — see the note on its own assertion below — so this
// helper is the themes menu's rule now, and the composer's only in that it reads the same number.
//
// Asserted as ALPHA, not as a colour, so a theme change cannot break it.
//
// THREE SYNTAXES, not one. This read `rgba(...)` only and returned alpha `null` — which is
// FALSY, so it failed the assertion and looked exactly like a real regression — the moment
// #dock.big started mixing its tint from the theme's paper: Chrome computes a `color-mix()`
// background to `color(srgb r g b / a)`, which the old pattern could not see. The alpha is
// wherever it is: after a slash in the modern forms, fourth in a legacy comma list, and absent
// means opaque.
const opaque = (sel) => page.eval(`(() => { const e = document.querySelector('${sel}');
  if (!e) return null; const bg = getComputedStyle(e).backgroundColor;
  const slash = /\\/\\s*([0-9.]+)(%?)\\s*\\)/.exec(bg);
  if (slash) return { bg, alpha: parseFloat(slash[1]) / (slash[2] ? 100 : 1) };
  const m = /rgba?\\(([^)]+)\\)/.exec(bg); if (!m) return { bg, alpha: null };
  const parts = m[1].split(',').map(x => parseFloat(x));
  return { bg, alpha: parts.length > 3 ? parts[3] : 1 }; })()`);

await page.eval("(() => { document.querySelector('[data-appearance]')?.click(); return 1; })()");
await wait(400);
const app = await opaque('#appearance');
console.log("  #appearance: " + JSON.stringify(app));
ok(`the themes menu is fully opaque at phone width (alpha ${app && app.alpha})`,
   !!app && app.alpha === 1);
// AND IT COVERS THE WINDOW. Opacity was asserted here and coverage was not, which is why a
// screenshot from Seth's phone — the panel as a band with the header above it and the composer
// below — did not correspond to any red. Measured at every UI scale, because `zoom` on <body> is
// the most likely thing to have re-based it and it is the size he writes at.
for (const scale of ['100', '110', '125']) {
  await page.eval(`(() => { document.documentElement.dataset.uiScale = '${scale}'; return 1; })()`);
  await wait(250);
  const box = await page.eval(`(() => { const a = document.getElementById('appearance');
    if (!a || a.hidden) return null; const r = a.getBoundingClientRect();
    return { top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width),
             vh: innerHeight, vw: innerWidth, pos: getComputedStyle(a).position }; })()`);
  console.log(`  #appearance @${scale}: ` + JSON.stringify(box));
  ok(`  and covers the whole window at UI scale ${scale} (${box && box.h} of ${box && box.vh})`,
     !!box && box.top === 0 && Math.abs(box.h - box.vh) <= 1 && Math.abs(box.w - box.vw) <= 1);
}
await page.eval("(() => { document.documentElement.dataset.uiScale = '100'; return 1; })()");
await wait(200);
// The close button and the tab row must not be on top of one another. The head is sticky, so the
// tabs scroll UNDER it — measured as the gap between the bottom of the ✕ and the top of the first
// tab, which is the thing a reader actually sees closing up.
const gap = await page.eval(`(() => {
  const x = document.querySelector('#appearance [data-appearance="0"]');
  const tab = document.querySelector('#appearance [data-looktab]');
  if (!x || !tab) return null;
  return Math.round(tab.getBoundingClientRect().top - x.getBoundingClientRect().bottom);
})()`);
console.log("  gap between the close button and the tabs: " + gap + "px");
ok(`the tab row clears the close button (${gap}px)`, gap !== null && gap >= 14);

await page.eval("(() => { document.querySelector('[data-appearance]')?.click(); return 1; })()");
await wait(300);

await page.eval("(() => { document.querySelector('[data-bigin]')?.click(); return 1; })()");
await wait(400);
// AND MAXIMIZED, IT WEARS THE SEND BLUR — plus a little tint of its own. Seth, 2026-08-28: "do
// the same treatment on that background as the one that we do when we press send so that that
// experience is cohesive", then "make it a litttttle bit more opaque just when its maximized."
// This walks back issue #8's letter on purpose — #8 asked for opaque and got it, and the opaque
// sheet is now a blur plus 30% of the theme's paper.
//
// BOUNDED ON BOTH SIDES, and that is the whole point of the assertion. alpha 1 is issue #8's
// opaque sheet coming back; alpha 0 is the bare send veil with nothing under the words you are
// typing, which is what he asked to move off. Only the band between them is the thing that was
// asked for, so a single-sided check would pass on one of the two states he rejected.
// The blur is asserted separately because a tint alone is not the send treatment. Its RADIUS is
// not restated here: the two surfaces share one declaration in app.html and cannot drift on it.
const big = await opaque('#dock.big');
const bigBlur = await page.eval(`(() => { const e = document.querySelector('#dock.big');
  if (!e) return null; const s = getComputedStyle(e);
  return s.backdropFilter || s.webkitBackdropFilter || null; })()`);
console.log("  #dock.big: " + JSON.stringify(big) + " backdrop-filter: " + bigBlur);
ok(`the expanded composer is tinted but not a sheet (alpha ${big && big.alpha})`,
   !!big && big.alpha > 0 && big.alpha < 1);
ok(`  and wears the same blur as the send veil (${bigBlur})`,
   !!bigBlur && /blur\(\s*[0-9.]+px\s*\)/.test(bigBlur));
// And it really is covering the whole screen, which is the other half of the rule.
const cover = await page.eval(`(() => { const d = document.querySelector('#dock.big');
  if (!d) return null; const r = d.getBoundingClientRect();
  return { top: Math.round(r.top), h: Math.round(r.height), vh: innerHeight }; })()`);
console.log("  #dock.big box: " + JSON.stringify(cover));
ok(`  and covers the viewport top to bottom, header included (${cover && cover.top}, ${cover && cover.h} of ${cover && cover.vh})`,
   !!cover && cover.top === 0 && Math.abs(cover.h - cover.vh) <= 1);
await page.eval("(() => { document.querySelector('[data-bigin]')?.click(); return 1; })()");
await wait(300);

// ---- THE MIRROR AND THE TEXTAREA ARE ONE BOX WEARING TWO HATS (2026-08-28).
//
// You read the mirror; the caret belongs to the textarea underneath, whose own text is
// transparent. So the two have to lay out every glyph identically or the gap between what you see
// and where the cursor sits GROWS with every character — Seth: "as you type it creates more and
// more space." It had gone wrong twice before this check existed: `font-weight:600` on a mention,
// then `font-size:inherit` in a later block quietly beating the `font-size:17px` above it, which
// is what this was written for. Measured 333.3px against 274.5px for one line of prose.
//
// TWO NUMBERS, because there are two ways to be wrong and they look the same on screen. Glyph
// WIDTH catches the cumulative drift; text ORIGIN catches a constant offset, which is what the
// maximized composer had — the wrap drops its 13px of padding there and the mirror kept re-adding
// it, so the words sat 13px right of the caret from the first character.
//
// Asked of a real canvas at each element's own computed font rather than compared as strings: two
// different declarations can agree on the number and still disagree on the family, and it is the
// rendered width that the caret is counting.
const metrics = () => page.eval(`(() => {
  const i = document.querySelector('#input'), m = document.querySelector('#inputMirror');
  if (!i || !m) return null;
  const cv = document.createElement('canvas').getContext('2d');
  const draw = e => { const s = getComputedStyle(e);
    cv.font = s.fontStyle + ' ' + s.fontWeight + ' ' + s.fontSize + '/' + s.lineHeight + ' ' + s.fontFamily;
    return Math.round(cv.measureText('the quick brown fox jumps over the lazy dog').width * 10) / 10; };
  const origin = e => { const s = getComputedStyle(e);
    return Math.round((e.getBoundingClientRect().left + parseFloat(s.paddingLeft)) * 10) / 10; };
  return { iw: draw(i), mw: draw(m), ix: origin(i), mx: origin(m) }; })()`);

for (const mode of ["docked", "maximized"]) {
  if (mode === "maximized") {
    await page.eval("(() => { document.querySelector('[data-bigin]')?.click(); return 1; })()");
    await wait(400);
  }
  const m = await metrics();
  console.log(`  ${mode}: ` + JSON.stringify(m));
  // Sub-pixel only. A whole pixel of disagreement is already a pixel per character.
  ok(`the ${mode} mirror renders the same glyph width as the textarea (${m && m.iw} vs ${m && m.mw})`,
     !!m && Math.abs(m.iw - m.mw) < 0.5);
  ok(`  and starts its text at the same x (${m && m.ix} vs ${m && m.mx})`,
     !!m && Math.abs(m.ix - m.mx) < 0.5);
  if (mode === "maximized") {
    await page.eval("(() => { document.querySelector('[data-bigin]')?.click(); return 1; })()");
    await wait(400);
  }
}

// ---- THE MIRROR SCROLLS WITH THE BOX (2026-08-28). Seth: "when the input is maximized that
// needs to be scrollable." It always did scroll — measured, the textarea clamped correctly and
// reached scrollTop 961 when asked. What never moved was the MIRROR, which is the layer with the
// words in it, so from the chair the box was frozen at the first screenful with the caret gone off
// the bottom. `atMirror` copies scrollTop but only runs on `input`, and a wheel, a drag or the
// browser's own scroll-to-the-caret are not that event.
//
// Driven through the box's own scroll rather than by calling the handler, because a listener
// registered for the wrong event or on the wrong node is exactly the bug being fixed here.
await page.eval("(() => { document.querySelector('[data-bigin]')?.click(); return 1; })()");
await wait(400);
const scrolled = await page.eval(`(async () => {
  const ta = document.querySelector('#input'), m = document.querySelector('#inputMirror');
  if (!ta || !m) return null;
  ta.value = Array.from({length: 60}, (_, i) => 'line ' + (i + 1) + ' of the paragraph').join('\\n');
  ta.dispatchEvent(new Event('input', {bubbles: true}));
  const room = ta.scrollHeight - ta.clientHeight;
  ta.scrollTop = 99999;
  await new Promise(r => setTimeout(r, 120));
  return { room, ta: ta.scrollTop, m: m.scrollTop, mRoom: m.scrollHeight - m.clientHeight };
})()`);
console.log("  maximized scroll: " + JSON.stringify(scrolled));
// The box must have somewhere to go, or the check below passes on two zeroes — the false green
// this project keeps finding. Asserted first and separately.
ok(`the maximized box has more text than height (${scrolled && scrolled.room}px of overflow)`,
   !!scrolled && scrolled.room > 100);
ok(`  and the mirror follows it down (mirror ${scrolled && scrolled.m} vs box ${scrolled && scrolled.ta})`,
   !!scrolled && scrolled.ta > 0 && Math.abs(scrolled.m - scrolled.ta) <= 1);
await page.eval("(() => { const t = document.querySelector('#input'); t.value = ''; t.dispatchEvent(new Event('input', {bubbles:true})); document.querySelector('[data-bigin]')?.click(); return 1; })()");
await wait(400);

// ---- AND A REPAINT BRINGS THE LINE BACK VISIBLE, not just present. drawDock saves the half
// written line and puts it back, but the textarea's text is transparent and only the mirror is
// read — and nothing in that path painted the mirror, so the sentence came back invisible and
// stayed invisible until the next keystroke. Seth: "i have noticed that yes."
//
// The assertion is on the MIRROR's text, not the textarea's value. `ta.value` survived the whole
// time this bug existed, so a check on the value is one that cannot fail for the thing that broke.
await page.eval(`(() => { const t = document.querySelector('#input');
  t.value = 'the half written line'; t.dispatchEvent(new Event('input', {bubbles: true})); return 1; })()`);
await wait(250);
await page.mode('act');
await wait(450);
const survived = await page.eval(`(() => {
  const t = document.querySelector('#input'), m = document.querySelector('#inputMirror');
  return { value: t && t.value, mirror: m && m.textContent.trim() }; })()`);
console.log("  across a repaint: " + JSON.stringify(survived));
ok(`the half-written line is still in the box after a repaint (${survived && survived.value})`,
   !!survived && survived.value === 'the half written line');
ok(`  and the mirror is drawing it, so it can be seen (${survived && survived.mirror})`,
   !!survived && survived.mirror === 'the half written line');
await page.eval(`(() => { const t = document.querySelector('#input'); t.value = '';
  t.dispatchEvent(new Event('input', {bubbles: true})); return 1; })()`);
await page.mode('direct');
await wait(400);

// ---- A DOUBLE TAP IN THE BOX OPENS THE FULL-SCREEN ONE. Same gesture as the passage tray, and
// the same bargain: ⤢ is what must always work, this is the shortcut for when your hands are
// already in the box. It only OPENS — a double tap inside the big composer would otherwise close
// the thing you are typing into.
{
  const big = () => page.eval("(() => !!document.querySelector('#dock.big'))()");
  const dbl = () => page.eval("(() => { document.getElementById('input')"
    + ".dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); return 1; })()");

  if (await big()) { await page.eval("(() => { document.querySelector('[data-bigin]')?.click(); return 1; })()"); await wait(300); }
  ok("the composer starts small", !(await big()));
  await dbl(); await wait(400);
  ok("a double tap in the box opens the full-screen composer", await big());

  // And does NOT close it again, which is the half that would be infuriating: you double-tap a
  // word to select it while writing and the screen you are writing on disappears.
  await dbl(); await wait(400);
  ok("  and a second double tap does not close it — that is what ⤢ is for", await big());
  await page.eval("(() => { document.querySelector('[data-bigin]')?.click(); return 1; })()");
  await wait(300);
  ok("  ⤢ still closes it", !(await big()));
}

console.log(red ? `\n  ${red} RED` : "\n  all green");

// ---- ENTER AND SHIFT+ENTER (2026-08-31). Seth: "remove the shift little icon in the input box,
// also for enter to create a new line and the send button to be the thing you use to send", and
// "right now the shift enter doesnt make a new line it just sends".
//
// Driven with real key events through CDP, because the whole question is what the browser reports
// on the event — `e.shiftKey` — and no DOM harness can answer that.
//
// THE DETECTOR IS VALIDATED BEFORE ANY OF IT IS BELIEVED: window.fetch is patched to count calls to
// /api/generate and refuse them, and the FIRST assertion presses the send button and requires the
// count to rise. A counter that cannot see a real send would report both key tests green with the
// bug fully present, which is the exact shape this project has been bitten by.
{
  await page.eval(`(() => {
    window.__gen = 0;
    const real = window.fetch;
    window.fetch = (u, o) => {
      if (String(u).includes('/api/generate')) { window.__gen++; return Promise.reject(new Error('blocked by test')); }
      return real(u, o);
    };
    return 1; })()`);
  const gen = () => page.eval("window.__gen");

  // The value is set directly rather than typed. `page.type` clicks the selector first and the
  // composer's textarea is transparent under `#inputMirror`, so the characters went nowhere and the
  // box was empty — the app then refused the send with "Say what happens next", and the detector
  // read that as "a send makes no call". The app was right and the test was wrong.
  await page.eval("(() => { const t = document.querySelector('#input'); t.value = 'one'; t.focus(); return 1; })()");
  // A dispatched bubbling click, not page.click: at phone width the CDP tap did not land on the
  // button at all — a listener added to #send counted zero — so the detector was reporting on a
  // press that never happened. The delegated handler lives on `document` and matches with
  // closest(), so a bubbling MouseEvent exercises the same path a real press does, and the
  // synthetic-tap guard only drops a click that FOLLOWS a tap it delivered, which there is none of.
  await page.eval("(() => { document.querySelector('#send').dispatchEvent(new MouseEvent('click', { bubbles: true })); return 1; })()");
  await wait(400);
  const diag = await page.eval(`(() => ({
    gen: window.__gen,
    disabled: !!document.querySelector('#send')?.disabled,
    value: document.querySelector('#input')?.value,
    toast: document.querySelector('#toast')?.textContent?.slice(0,60) ?? null,
    patched: String(window.fetch).includes('__gen') })) ()`);
  ok(`the detector can see a send at all ${JSON.stringify(diag)}`, diag.gen === 1);

  await page.eval("(() => { window.__gen = 0; const t = document.querySelector('#input'); t.value = 'two'; t.focus(); return 1; })()");
  await page.key('Enter', 13, 8);                 // 8 is CDP's Shift bit
  ok(`  Shift+Enter does not send (${await gen()} generate calls)`, (await gen()) === 0);

  await page.eval("(() => { window.__gen = 0; const t = document.querySelector('#input'); t.focus(); return 1; })()");
  await page.key('Enter', 13, 0);
  ok(`  and plain Enter does not send either (${await gen()} generate calls)`, (await gen()) === 0);

  ok("  and the ↵ hint is gone from the composer",
     !(await page.eval("(() => !!document.querySelector('#dock .deskonly'))()")));
}
