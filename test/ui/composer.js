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

// ---- #3. "The send button and the expand input button are too small."
//
// 44px is the floor every touch guideline agrees on, and this project has its own evidence for
// why: F34 measured that a press drifting 24px is one this surface can already lose, so a target
// smaller than a fingertip makes that drift the rule rather than the exception.
const box = (sel) => page.eval(`(() => { const e = document.querySelector('${sel}');
  if (!e) return null; const r = e.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left),
           right: Math.round(r.right) }; })()`);

for (const [what, sel] of [["send", "#send"], ["the expand button", "#inputRow [data-bigin]"]]) {
  const b = await box(sel);
  if (!b) { ok(`${what} is on the page`, false); continue; }
  console.log(`  ${what}: ${JSON.stringify(b)}`);
  ok(`${what} is at least 44px square on a phone (${b.w}x${b.h})`, b.w >= 44 && b.h >= 44);
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
    return { size: Math.round(parseFloat(s.fontSize)), bg: s.backgroundColor,
             radius: s.borderRadius, w: Math.round(e.getBoundingClientRect().width) }; };
  return { send: g('#send'), big: g('#inputRow [data-bigin]') };
})()`);
console.log("  send/expand: " + JSON.stringify(pair));
ok("both buttons are on the page", !!pair.send && !!pair.big);
ok(`  the expand button is the same size as Send (${pair.big?.w} vs ${pair.send?.w})`,
   pair.big?.w === pair.send?.w);
ok(`  the same glyph size (${pair.big?.size} vs ${pair.send?.size})`, pair.big?.size === pair.send?.size);
ok(`  the same fill and the same shape (${pair.big?.bg})`,
   pair.big?.bg === pair.send?.bg && pair.big?.radius === pair.send?.radius);
ok(`  and still big enough to read (${pair.big?.size}px)`, (pair.big?.size ?? 0) >= 16);

// ---- #4. "The act as or speak as row doesn't reach the edges on the left or the right."
//
// The strip was inset three times over — the dock's 18px, then #asRow's 18, then .inner's 18 —
// so it sat 54px in while the mode rail under it sat at 18. Asserted as ALIGNMENT with #modes
// rather than as a pixel count, because what was wrong was the disagreement between the two, and
// a fixed number here would have to be rewritten the next time the dock's padding changes.
await page.eval("(() => { document.querySelector('[data-mode=\"speak\"]')?.click(); return 1; })()");
await wait(500);
// Measured on the TEXT, not on `.inner`'s box. The first version compared `.inner`'s bounding
// rect against #modes and stayed green when the padding was put back — because an element's own
// padding is inside its box, so `.inner`'s rect never moved. What a reader sees not reaching the
// edge is the label and the name, and those are what the padding pushes in.
const label = await box("#asRow .inner span");
const sel = await box("#asRow select");
const firstMode = await box("#modes button");
const modes = await box("#modes");
if (!label || !sel || !firstMode || !modes) {
  ok("the speak-as row and the mode rail are both on screen", false);
} else {
  console.log(`  label ${JSON.stringify(label)}  select ${JSON.stringify(sel)}  modes ${JSON.stringify(modes)}`);
  ok(`the row's label starts at the same edge as the modes under it (${label.left} vs ${firstMode.left})`,
     Math.abs(label.left - firstMode.left) <= 1);
  ok(`  and the name it ends with reaches the other edge (${sel.right} vs ${modes.right})`,
     Math.abs(sel.right - modes.right) <= 1);
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
const gold = await page.eval("getComputedStyle(document.documentElement).getPropertyValue('--gold').trim()");
const strokeNow = await page.eval("(() => { const g = document.querySelector('#rail svg g'); return g ? getComputedStyle(g).stroke : null; })()");
const rgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return h;
  const v = parseInt(m[1], 16); return `rgb(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255})`; };
console.log(`  --gold ${gold} -> ${rgb(gold)} / stroke ${strokeNow}`);
ok(`  and its stroke is the theme's own accent, not a colour baked into a file (${strokeNow})`,
   !!strokeNow && strokeNow === rgb(gold));

// ---- FULL SCREEN MEANS FULL SCREEN (decided 2026-08-28, PLAN-07).
//
// Both of these were already fixed to all four edges and neither read as a screen, because you
// could see the page through them. `#appearance` carried the desk card's rgba(16,15,18,.97) into
// the full-screen rule — 3% of the prose behind a blur, and a hardcoded Obsidian colour on a rule
// the other eight themes share. `#dock.big` inherited `--dock`, which is a gradient fading from
// nothing to 92% of the paper: right for a composer floating over prose, wrong for one that IS the
// screen. Issue #3: "the background behind the input should be completely opaque. It is currently
// not opaque which makes it hard to read anything."
//
// Asserted as ALPHA, not as a colour, so a theme change cannot break it.
const opaque = (sel) => page.eval(`(() => { const e = document.querySelector('${sel}');
  if (!e) return null; const bg = getComputedStyle(e).backgroundColor;
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
const big = await opaque('#dock.big');
console.log("  #dock.big: " + JSON.stringify(big));
ok(`the expanded composer is fully opaque (alpha ${big && big.alpha})`, !!big && big.alpha === 1);
// And it really is covering the whole screen, which is the other half of the rule.
const cover = await page.eval(`(() => { const d = document.querySelector('#dock.big');
  if (!d) return null; const r = d.getBoundingClientRect();
  return { top: Math.round(r.top), h: Math.round(r.height), vh: innerHeight }; })()`);
console.log("  #dock.big box: " + JSON.stringify(cover));
ok(`  and covers the viewport top to bottom, header included (${cover && cover.top}, ${cover && cover.h} of ${cover && cover.vh})`,
   !!cover && cover.top === 0 && Math.abs(cover.h - cover.vh) <= 1);
await page.eval("(() => { document.querySelector('[data-bigin]')?.click(); return 1; })()");
await wait(300);

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
