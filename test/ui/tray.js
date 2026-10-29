// Issue #2 — "Double tapping on a new entry makes the menu that pops up pop up under it making it
// unusable." Reported from a phone, 2026-08-28.
//
// MEASURED, not reasoned. On a phone three surfaces become `position:fixed; inset:0` and sit above
// the tray's sheet: #rail at z-index 40, #appearance at 41, #dock.big at 41, against the tray's 32.
// With the composer expanded, `elementFromPoint` at the middle of an open tray returned `#input`;
// with the menu open it returned one of the rail's buttons. The tray was there, correctly centred,
// and nothing on it could be pressed.
//
// The rule is one sentence and it holds both ways: while a full-screen surface is up there is no
// tray. It will not open under one, and one opening shuts it.
//
//   test/ui/run.sh tray
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (l, g) => { if (!g) red++; console.log("  " + (g ? "ok  " : "RED ") + l); };

const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s=>s.title==='The Silver Key').id)()");
await page.mobile();
await page.goto(B + "/#" + sid);
for (let i = 0; i < 40 && !(await page.visible('#col .block')); i++) await wait(250);

const open = () => page.eval("(() => { const b = document.querySelector('#col .block.newest') || document.querySelector('#col .block'); b.dispatchEvent(new MouseEvent('dblclick',{bubbles:true})); return 1; })()");
const shut = () => page.eval("(() => { for (const b of document.querySelectorAll('.block[aria-expanded=\"true\"]')) b.setAttribute('aria-expanded','false'); return 1; })()");
// Where the tray is, and — the half that matters — whether anything can be pressed on it.
const probe = () => page.eval(`(() => {
  const a = document.querySelector('.block[aria-expanded="true"] .acts');
  if (!a) return { open: false };
  const r = a.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { open: true, midY: Math.round(r.top + r.height / 2), wantY: Math.round(innerHeight / 2),
           onTop: !!(hit && hit.closest('.acts')),
           covering: hit ? String(hit.id || hit.className || hit.tagName).slice(0, 30) : 'none' };
})()`);

await open();
let g = await probe();
console.log("  plain: " + JSON.stringify(g));
ok("the tray opens on a double tap", g.open);
ok(`  centred on the viewport, not on the paragraph (${g.midY} vs ${g.wantY})`, Math.abs(g.midY - g.wantY) <= 24);
// The whole complaint. A tray that is drawn and cannot be pressed is worse than one that is shut,
// because it looks like the app answered.
ok("  and it is the topmost thing at its own centre — pressable", g.onTop);
await shut();

for (const [label, on, off] of [
  ["the expanded composer", "(() => { document.querySelector('[data-bigin]')?.click(); return 1; })()",
    "(() => { document.querySelector('[data-bigin]')?.click(); return 1; })()"],
  ["the menu", "(() => { document.querySelector('[data-rail]')?.click(); return 1; })()",
    "(() => { document.querySelector('[data-rail]')?.click(); return 1; })()"],
]) {
  await page.eval(on); await wait(350);
  await open(); await wait(250);
  const covered = await probe();
  console.log(`  under ${label}: ` + JSON.stringify(covered));
  // Either it did not open, or it opened on top. What must never happen is open-and-covered.
  ok(`the tray does not open under ${label}`, !covered.open || covered.onTop);
  await page.eval(off); await wait(350);

  // And the other direction: open first, then raise the surface over it.
  await open(); await wait(250);
  const before = await probe();
  await page.eval(on); await wait(350);
  const after = await probe();
  console.log(`  ${label} raised over an open tray: ` + JSON.stringify(after));
  ok(`  opening ${label} shuts a tray that was already up`, before.open && !after.open);
  await page.eval(off); await wait(350);
  await shut();
}

// ---- THE ONE SETH ACTUALLY HIT. "when a new message is sent by the ai ... the menu that pops up
// is overlayed by the blur that pops up with it ... any other selection is fine, it is just the new
// entry that has an issue."
//
// A passage the model just wrote carries `.arrived` for 1.7s, and that class sets `mask-image`.
// A MASK makes an element a containing block for position:fixed descendants and a stacking context,
// exactly as transform and filter do — so the tray's sheet at z-index 32 gets capped inside the
// block and #scrim at 31 paints over the top of it. app.html already carried
// `#col .block[aria-expanded="true"] { animation:none }` from a previous round of this same bug,
// written for `.newest`'s transform animation; it kills the ANIMATION and leaves the mask, which is
// a static property of the class and not part of it.
//
// Every earlier probe used a seeded newest block and passed. This one puts the class on by hand,
// which is what `arrive()` does after a generation, and asserts what is TOPMOST rather than where
// the sheet is — the measurement that was missing.
{
  await shut();
  await page.eval("(() => { const b = document.querySelector('#col .block.newest') || document.querySelector('#col .block'); b.classList.add('arrived'); return 1; })()");
  await wait(200);
  await open();
  const g = await probe();
  console.log("  just-arrived passage: " + JSON.stringify(g));
  ok("the tray opens on a passage that has just arrived", g.open);
  ok(`  and the blur does not land on top of it (topmost: ${g.covering})`, g.onTop);

  // And the general form, because this is the third property in this family to do it: while a
  // tray is open its block may create NO containing block for a fixed child. transform, filter,
  // mask, backdrop-filter, perspective, will-change and contain all do, and the next one added to
  // a block class would break this again in a way the check above only catches by luck.
  const props = await page.eval(`(() => {
    const b = document.querySelector('.block[aria-expanded="true"]');
    if (!b) return null;
    const s = getComputedStyle(b);
    return { transform: s.transform, filter: s.filter, mask: s.maskImage || s.webkitMaskImage,
             backdrop: s.backdropFilter, perspective: s.perspective,
             willChange: s.willChange, contain: s.contain, animation: s.animationName };
  })()`);
  console.log("  open block's computed style: " + JSON.stringify(props));
  const rebasing = props && Object.entries(props).filter(([k, v]) =>
    !(v === 'none' || v === 'auto' || v === 'normal' || v === undefined || v === ''));
  ok(`  and nothing on the open block re-bases a fixed child (${JSON.stringify(rebasing)})`,
     !!props && rebasing.length === 0);
  await page.eval("(() => { document.querySelectorAll('#col .block').forEach(b => b.classList.remove('arrived')); return 1; })()");
  await shut();
}

// ---- THE RE-ROLL SHEET IS THE SECOND FIXED CHILD OF A BLOCK (2026-09-02).
// Seth, of the panel that used to open inside the paragraph: "this should be as a toast center
// screen not inline." It takes the same route the tray above does, so it inherits the same trap —
// a position:fixed child of a block carrying a filled transform animation or a mask is positioned
// against the BLOCK and has its z-index capped inside it. Third round of that bug, second feature.
// ON THE FIXTURE'S ONE DIRECTED PASSAGE, so the box has an instruction in it. OPENED WITH ALT+CLICK,
// the desk's hold: since 2026-10-29 a tap on Reweave reweaves at once and a hold opens the box
// (Seth: "the button just reweaves; holding the reweave button opens what we just built").
{
  await page.goto(B + "/#" + sid);
  for (let i = 0; i < 40 && !(await page.eval("!!document.querySelector('#col .block')")); i++) await wait(250);
  const target = await page.eval(
    "(() => document.querySelector('#col .block.directed [data-re]')?.dataset.re ?? null)()");
  ok(`the fixture has a directed passage to re-roll (${target})`, !!target);
  const openBox = `(() => { document.querySelector('[data-re="${target}"]').dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true })); return 1; })()`;
  await page.eval(openBox);
  await wait(600);
  // THE FULL-SCREEN BOX since 2026-10-25 (Seth: "the regenerate screen should match the maximized
  // edit screen"): it covers the window, Cancel where the composer's Back is, Reweave where Send is.
  const sheet = await page.eval(`(() => {
    const box = document.querySelector('.rerollbox'); if (!box) return null;
    const r = box.getBoundingClientRect(); const cs = getComputedStyle(box);
    const blk = box.closest('.block'); const bs = getComputedStyle(blk);
    const ta = box.querySelector('[data-rerollbox]').getBoundingClientRect();
    const x = box.querySelector('[data-rerollx]').getBoundingClientRect();
    const go = box.querySelector('[data-rerollgo]').getBoundingClientRect();
    const body = blk.querySelector('.ptext, .said, p')?.textContent ?? blk.textContent;
    const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    return JSON.stringify({ position: cs.position,
      full: Math.round(r.width) === innerWidth && Math.round(r.height) === innerHeight,
      quote: box.querySelector('.rwquote')?.textContent.trim() ?? '',
      instruction: box.querySelector('[data-rerollbox]').value,
      order: x.right <= ta.left && ta.right <= go.left,
      tall: Math.round(ta.height) > innerHeight / 3,
      sides: [Math.round(x.height), Math.round(go.height)],
      frame: [getComputedStyle(box.querySelector('[data-rerollbox]')).borderTopColor, getComputedStyle(box.querySelector('[data-rerollbox]')).outlineStyle],
      rebases: [bs.transform, bs.filter, bs.maskImage || bs.webkitMaskImage, bs.animationName]
        .filter((v) => !(v === 'none' || v === 'auto' || v === 'normal' || !v)),
      onTop: !!hit && !!hit.closest('.rerollbox') }); })()`).then((x) => (x ? JSON.parse(x) : null));
  console.log("  reweave box: " + JSON.stringify(sheet));
  ok("  it opens full screen, like the full-screen composer", !!sheet && sheet.position === 'fixed' && sheet.full);
  ok(`  with the passage's first line quoted above the box (${JSON.stringify(sheet && sheet.quote.slice(0, 50))})`,
     !!sheet && sheet.quote.length > 10);
  ok("  and the instruction in the big box", !!sheet && sheet.instruction.length > 0 && sheet.tall);
  ok("  Cancel on the left, Reweave on the right, as Back and Send", !!sheet && sheet.order);
  // BUTTON-SIZED, AND NO FRAME ROUND THE TEXT (Seth, 2026-10-26: "Regenerate has the same issue as the
  // alter screen"): the row stretched Cancel and Reweave to the box's height, and the field drew a box.
  ok(`  Cancel and Reweave are button-sized, not the box's height (${sheet && sheet.sides})`,
     !!sheet && sheet.sides.every((h) => h <= 60));
  ok(`  and the instruction has no frame round it (${sheet && sheet.frame})`,
     !!sheet && /rgba\(0, 0, 0, 0\)|transparent/.test(sheet.frame[0]));
  ok(`  with nothing on its block re-basing it (${JSON.stringify(sheet && sheet.rebases)})`,
     !!sheet && sheet.rebases.length === 0);
  ok("  and it is what a press in the middle of the screen hits", !!sheet && sheet.onTop);
  const takes = await page.eval(`(async () => (await (await fetch('/api/story?story=${sid}')).json()).passages.length)()`);
  // BACK CLOSES IT without reweaving: it is a layer, like the full-screen composer.
  await page.eval("(() => { history.back(); return 1; })()");
  await wait(600);
  ok("  Back closes it", !(await page.eval("!!document.querySelector('.block.rerolling .rerollbox')")));
  ok("  without reweaving", (await page.eval(`(async () => (await (await fetch('/api/story?story=${sid}')).json()).passages.length)()`)) === takes);
  ok("  and the tale is still open", await page.eval("!!document.querySelector('#col .block')"));
  // And Esc, the same.
  await page.eval(openBox);
  await wait(600);
  await page.key('Escape', 27); await wait(400);
  ok("  and so does Esc",
     !(await page.eval("!!document.querySelector('.block.rerolling .rerollbox')")));
}
/* REGENERATE OVER YOUR OWN PARAGRAPH ASKS FIRST. 2026-09-18. The button is drawn on the last
 * passage and in every tray whatever wrote it, so in a book the writer narrates themselves the
 * usual thing under it is their own prose — and a re-roll lands a model take in that slot, which
 * is what the page then shows. It is recoverable behind ‹ ›, and it was a single press.
 *
 * THE FIXTURE HAS NO HUMAN PASSAGE — seed.ts writes every one of them as the model — so this
 * makes one through the write route, which is the same door the composer uses and costs no
 * generation. That absence is also why nothing else here exercises the guard.
 *
 * ONE DIRECTION ONLY, deliberately: the second press generates, and a scenario in the default set
 * cannot wait on the model. The other direction — that a MODEL passage re-rolls on one press — is
 * what `test/ui/model.js` has always asserted, so it goes red there if this guard over-fires. */
{
  await page.eval(`(async () => { await fetch('/api/write', { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storyId: '${sid}', mode: 'narrate',
      body: 'She set the key down on the sill and did not look at it again.' }) }); })()`);
  await page.goto(B + "/#" + sid);
  for (let i = 0; i < 40 && !(await page.eval("!!document.querySelector('#nextbar [data-re]')")); i++) await wait(250);
  const before = await page.eval(`(async () => (await (await fetch('/api/story?story=${sid}')).json()).passages.length)()`);
  const mine = await page.eval(`(async () => {
    const r = await (await fetch('/api/story?story=${sid}')).json();
    const last = r.passages.filter(p => !p.isBreak).at(-1);
    return last && last.author === 'human' ? last.id : null; })()`);
  ok(`the writer's own passage is the one at the end (${mine})`, !!mine);
  await page.eval("(() => { document.querySelector('#nextbar [data-re]').click(); return 1; })()");
  await wait(700);
  ok("  one press does not start a generation over it",
     !(await page.eval("!!document.getElementById('ghost')")));
  ok("  nothing was written", await page.eval(
     `(async () => (await (await fetch('/api/story?story=${sid}')).json()).passages.length)()`) === before);
  ok("  and it says why, rather than doing nothing visible", /yours/i.test(
     (await page.eval("(() => { const t = document.getElementById('toast'); return t && !t.hidden ? t.textContent : ''; })()")) || ''));
}
console.log(red ? `\n  ${red} RED` : "\n  all green");
