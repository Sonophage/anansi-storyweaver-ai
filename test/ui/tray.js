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
// ON THE FIXTURE'S ONE DIRECTED PASSAGE: only a passage that carries an instruction has a sheet to
// open, so seed.ts directs its last one. If that ever stops being true this block says so rather
// than passing on an absence.
{
  await page.goto(B + "/#" + sid);
  for (let i = 0; i < 40 && !(await page.eval("!!document.querySelector('#col .block')")); i++) await wait(250);
  const target = await page.eval(
    "(() => document.querySelector('#col .block.directed [data-re]')?.dataset.re ?? null)()");
  ok(`the fixture has a directed passage to re-roll (${target})`, !!target);
  await page.eval(`(() => { document.querySelector('[data-re="${target}"]').click(); return 1; })()`);
  await wait(600);
  const sheet = await page.eval(`(() => {
    const box = document.querySelector('.rerollbox'); if (!box) return null;
    const r = box.getBoundingClientRect(); const cs = getComputedStyle(box);
    const blk = box.closest('.block'); const bs = getComputedStyle(blk);
    const scrim = getComputedStyle(document.getElementById('scrim'));
    const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + 20));
    return JSON.stringify({ position: cs.position,
      offX: Math.abs(r.left + r.width / 2 - innerWidth / 2),
      offY: Math.abs(r.top + r.height / 2 - innerHeight / 2),
      rebases: [bs.transform, bs.filter, bs.maskImage || bs.webkitMaskImage, bs.animationName]
        .filter((v) => !(v === 'none' || v === 'auto' || v === 'normal' || !v)),
      scrimShown: scrim.opacity !== '0' && scrim.pointerEvents !== 'none',
      onTop: !!hit && !!hit.closest('.rerollbox') }); })()`).then((x) => (x ? JSON.parse(x) : null));
  console.log("  re-roll sheet: " + JSON.stringify(sheet));
  ok("  it opens as a centred sheet, not inline in the paragraph",
     !!sheet && sheet.position === 'fixed');
  ok(`  centred on the WINDOW (off by ${sheet && sheet.offX}, ${sheet && sheet.offY})`,
     !!sheet && sheet.offX <= 2 && sheet.offY <= 2);
  // The whole reason it cannot be centred naively: a block that re-bases a fixed child centres the
  // sheet on the PARAGRAPH and caps its z-index under the scrim.
  ok(`  with nothing on its block re-basing it (${JSON.stringify(sheet && sheet.rebases)})`,
     !!sheet && sheet.rebases.length === 0);
  ok("  the scrim is up under it, so a press outside is Cancel", !!sheet && sheet.scrimShown);
  ok("  and the sheet is what a press at its top actually hits", !!sheet && sheet.onTop);
  // And the backdrop cancels rather than re-rolling: a press on nothing in particular is not a
  // press on Re-roll, which would spend a generation.
  // TWO CHECKS, NOT `page.click('#scrim')`. That presses an element's CENTRE, and the scrim covers
  // the window — so its centre is the middle of the screen, which is exactly where the sheet is.
  // The press landed on the sheet and the check went red for the wrong reason. So: the corner of
  // the screen really is the scrim, and the scrim's own press really does cancel.
  ok("  the corner of the screen is the backdrop, not the sheet", await page.eval(
    "document.elementFromPoint(20, 20)?.id === 'scrim'"));
  await page.eval("(() => { document.getElementById('scrim').click(); return 1; })()");
  await wait(500);
  ok("  and a press on it closes the sheet without re-rolling",
     !(await page.eval("!!document.querySelector('.rerollbox')")));
}
console.log(red ? `\n  ${red} RED` : "\n  all green");
