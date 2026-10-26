// Alter: the full-screen box, Save, Cancel, Esc and Back, and the page staying where it was.
//
//   bash test/ui/run.sh alter
//
// The usability check of 2026-10-24 called Alter dangerous: it opened with the whole passage
// selected, so one keystroke replaced it, and "click away to save" was the only way out. It became
// an edit in place with Save and Cancel under it; since 2026-10-26 it is the full-screen box (Seth:
// "The edit screen should be the same maximized input screen"), and the page under it does not move
// ("editing takes me to the bottom rather than just staying where I've activated it").
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (m, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${m}${cond ? "" : "   <-- broken"}`); if (!cond) red++; };

const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find((s) => s.title === 'The Silver Key').id)()");
await page.goto(B + "/#" + sid);
await wait(900);
const pid = await page.eval("document.querySelector('#col .block .narr, #col .block .said')?.dataset.edit");
const body = () => page.eval(`(async () => (await (await fetch('/api/story?story=${sid}')).json()).passages.find((p) => p.id === '${pid}')?.body ?? null)()`);
const start = await body();
ok(`a passage to alter (${pid})`, !!pid && !!start);
const scrollAt = () => page.eval("document.getElementById('read').scrollTop");
const open = () => page.eval("!!document.querySelector('.block.altering .rerollbox [data-editbox]')");
const typeIn = (text) => page.eval(`(() => { const b = document.querySelector('[data-editbox]');
  b.value = b.value + ${JSON.stringify(text)}; b.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);

// The first passage is at the top of the chapter; the page is scrolled to it, away from the bottom,
// so a repaint that sends the page to the bottom shows.
const alter = async () => {
  await page.eval(`(() => { document.querySelector('[data-edit="${pid}"]').scrollIntoView({ block: 'center', behavior: 'instant' }); return 1; })()`);
  await wait(200);
  const before = await scrollAt();
  await page.dbl(`[data-edit="${pid}"]`);
  await page.click(`[data-ed="${pid}"]`);
  await wait(400);
  return before;
};

// ---- the box
const was = await alter();
const box = await page.eval(`(() => { const b = document.querySelector('[data-editbox]'); if (!b) return null;
  const r = b.closest('.rerollbox').getBoundingClientRect(), x = document.querySelector('[data-editx]').getBoundingClientRect(),
    s = document.querySelector('[data-editsave]').getBoundingClientRect(), t = b.getBoundingClientRect();
  return JSON.stringify({ full: Math.round(r.width) === innerWidth && Math.round(r.height) === innerHeight,
    text: b.value, focus: document.activeElement === b, caretAtEnd: b.selectionStart === b.value.length && b.selectionEnd === b.value.length,
    order: x.right <= t.left && t.right <= s.left }); })()`).then((x) => x && JSON.parse(x));
ok(`Alter opens the full-screen box (${JSON.stringify(box && { ...box, text: box.text.length })})`, !!box && box.full);
ok("  with the passage's own text in it", !!box && box.text === start);
ok("  the caret at the end, nothing selected", !!box && box.focus && box.caretAtEnd);
ok("  Cancel on the left, Save on the right", !!box && box.order);
// THE BUTTONS ARE THE COMPOSER'S SIZE, AND THE TEXT HAS NO FRAME (Seth, 2026-10-26: "the buttons are
// really long. And the text is bounded by a blue box"). The row stretched them to the box's height.
const look = await page.eval(`(() => { const b = document.querySelector('[data-editbox]'), c = getComputedStyle(b);
  const h = [...document.querySelectorAll('.rerollbox .rwside')].map((x) => Math.round(x.getBoundingClientRect().height));
  return JSON.stringify({ h, border: c.borderTopColor, outline: c.outlineStyle, focus: document.activeElement === b }); })()`).then(JSON.parse);
ok(`  Cancel and Save are button-sized, not the box's height (${look.h})`, look.h.length === 2 && look.h.every((x) => x <= 60));
ok(`  and the text has no box round it (${look.border}, outline ${look.outline})`,
   look.focus && /rgba\(0, 0, 0, 0\)|transparent/.test(look.border) && look.outline === 'none');
// SET AS THE PAGE SETS IT (Seth, 2026-10-26: the font changes "in edit mode").
const fonts = await page.eval(`(() => { const f = (e) => { const c = getComputedStyle(e); return [c.fontFamily, c.fontSize, c.fontStyle].join(' | '); };
  return JSON.stringify([f(document.querySelector('[data-editbox]')), f(document.querySelector('[data-edit="${pid}"]'))]); })()`).then(JSON.parse);
ok(`  in the same type as the passage on the page (${fonts.join(' / ')})`, fonts[0] === fonts[1]);

// ---- a double tap in the box selects a word and opens nothing
await page.eval("(() => { document.querySelector('[data-editbox]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); return 1; })()");
await wait(300);
ok("a double tap in the box does not bring the passage menu back",
   !(await page.eval("!!document.querySelector('#col .block[aria-expanded=\"true\"]')")) && await open());

// ---- Cancel with nothing changed goes at once, and the page has not moved
await page.click('[data-editx]');
await wait(500);
const c1 = await scrollAt();
ok(`Cancel with nothing changed closes it, and the page is where it was (${was} -> ${c1})`,
   !(await open()) && Math.abs(c1 - was) <= 2);

// ---- Cancel with a change asks first
await alter();
await typeIn(" CANCELLED WORDS");
await page.click('[data-editx]');
await wait(400);
ok("Cancel with a change asks first", await open());
await page.click('[data-editx]');
await wait(700);
ok("  the second press throws it away", !(await open()) && (await body()) === start);

// ---- Esc, the same
await alter();
await page.key("Escape", 27);
await wait(500);
ok("Esc closes it when nothing changed", !(await open()));

// ---- Back, the same
await alter();
await page.eval("(() => { history.back(); return 1; })()");
await wait(700);
ok("Back closes it when nothing changed", !(await open()) && (await body()) === start);

// ---- Save saves, and the page stays
const at = await alter();
await typeIn(" SAVED WORDS");
await page.click('[data-editsave]');
await wait(1400);
const after = await body();
const c2 = await scrollAt();
ok(`Save saves (${JSON.stringify((after ?? '').slice(-40))})`, (after ?? '').includes('SAVED WORDS'));
ok(`  closes the box, and the page is where Alter was pressed (${at} -> ${c2})`,
   !(await open()) && Math.abs(c2 - at) <= 2);
ok("  and the saved words are on the page", await page.eval(`document.querySelector('[data-edit="${pid}"]').textContent.includes('SAVED WORDS')`));

// ---- Branch asks twice. One tap in the middle of the sheet used to branch, and the passages after it
// left the page.
const branches = () => page.eval(`(async () => ((await (await fetch('/api/story?story=${sid}')).json()).branches ?? []).length)()`);
const b0 = await branches();
await page.dbl(`[data-edit="${pid}"]`);
await page.click(`.block[aria-expanded="true"] [data-fork="${pid}"]`);
await wait(500);
ok(`one press on Branch makes no branch (${b0} -> ${await branches()})`, (await branches()) === b0);
ok("  and asks for a second press", /Press Branch again/.test((await page.eval("document.getElementById('toast')?.textContent ?? ''"))));
await page.click(`.block[aria-expanded="true"] [data-fork="${pid}"]`);
await wait(900);
ok(`  and the second press makes it (${await branches()})`, (await branches()) === b0 + 1);

console.log(red ? `\n  ${red} RED` : "\n  all green");
