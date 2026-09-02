// The waiting screen, driven against real generations.
//
// NOT IN THE DEFAULT SET, for the reason `model` and `ritual` are not: every assertion below waits
// on the model actually writing something, so this runs in minutes and needs llama-server up.
//
//   test/ui/run.sh veil
//
// It exists because none of this is visible to a source-level check. The behaviour under test is a
// veil that holds, a field of glyphs being eaten by words, a button that goes away, a background
// that darkens and a keystroke that dismisses — every one of them a computed style or a DOM state
// mid-flight. The check it replaced (#29's weave fade-versus-hold, in test/web.ts) guarded the
// ANANSI resolve, which was removed with the grid on 2026-09-02.
//
// THE ONE THAT MATTERS MOST is section 4: PLAN-07 bug 1 was a veil that could be left up by a
// failure, and the veil now deliberately HOLDS on success. Those two facts together are how you
// build a trap, so the abort path is asserted rather than assumed.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (l, g) => { if (!g) red++; console.log("  " + (g ? "ok  " : "RED ") + l); };
const veil = (what) => page.eval(`(() => {
  const g = document.getElementById('ghost'); if (!g) return null;
  const t = g.querySelector('.veiltext'), n = g.querySelector('.noise');
  const b = g.querySelector('.veilstop');
  return JSON.stringify({
    noise: n ? n.textContent.length : 0,
    words: t ? t.textContent.length - (n ? n.textContent.length : 0) : 0,
    spans: t ? t.querySelectorAll('span.tw').length : 0,
    stopShown: b ? getComputedStyle(b).display !== 'none' : false,
    dark: getComputedStyle(g).backgroundColor,
    top: t ? t.scrollTop : -1,
    written: g.classList.contains('written'), done: g.classList.contains('done') });
})()`).then((s) => (s ? JSON.parse(s) : null));

const send = async (text) => {
  await page.eval(`(() => { const i = document.getElementById('input');
    i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
  await page.type("#input", text);
  await page.eval("(() => { document.getElementById('send').click(); return 1; })()");
};

const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories[0].id)()");
await page.goto(B + "/#" + sid);
for (let i = 0; i < 40; i++) { if (await page.eval("!!document.querySelector('#rail [data-nav]')")) break; await wait(250); }

// ---- 1. before the first token: a field of glyphs, Stop offered, no tint
await send("The rain does not stop.");
let first = null;
for (let i = 0; i < 60; i++) { first = await veil(); if (first) break; await wait(100); }
ok("the veil goes up on the press", first != null);
ok("  with a field of glyphs where the prose will land", first != null && first.noise > 100);
ok("  no words in it yet", first != null && first.words === 0);
ok("  and Stop offered while there is something to stop", first != null && first.stopShown === true);
const bareBlur = first?.dark;

// ---- 2. as the words arrive they take the glyphs' place, Stop goes, the ground darkens
let mid = null, sawWords = false, seen = [];
for (let i = 0; i < 400; i++) {
  const v = await veil();
  if (!v) break;
  if (v.words > 0 && !sawWords) { sawWords = true; }
  if (v.words > 0) { seen.push(v.words); mid = v; }
  if (v.done) { mid = v; break; }
  await wait(250);
}
console.log("  words: " + JSON.stringify(seen.slice(0, 8)) + (seen.length > 8 ? " …" : ""));
ok("the prose types itself in", sawWords && new Set(seen).size > 1);
ok("  in separate fading spans, not one blob", (mid?.spans ?? 0) > 5);
ok("  Stop went with the glyphs once writing started", mid != null && mid.stopShown === false);
ok("  the veil darkened when the words came", mid != null && mid.dark !== bareBlur);
// Seth: "the view screen should stay at the top so the user can read."
ok("  and the view stayed at the top rather than chasing the tail", mid != null && mid.top === 0);

// ---- 3. it holds when the passage is done, and typing is the way out
const done = await veil();
ok("the veil holds after the passage finishes", done != null && done.done === true);
ok("  the glyph field is gone, because nothing more is coming", done != null && done.noise === 0);
ok("  and the passage landed on the page behind it",
   (await page.eval("document.querySelectorAll('#col .block').length")) > 0);
await page.eval("(() => { document.dispatchEvent(new KeyboardEvent('keydown',{key:'q',bubbles:true})); return 1; })()");
await wait(1200);
ok("typing takes the veil away", (await page.eval("!!document.getElementById('ghost')")) === false);
ok("  and the letter lands in the composer",
   (await page.eval("document.getElementById('input').value")) === "q");

// ---- 4. THE TRAP CHECK. A veil that holds on success must still leave on a failure.
await send("Once more, briefly.");
let up = false;
for (let i = 0; i < 60; i++) { if (await page.eval("!!document.getElementById('ghost')")) { up = true; break; } await wait(150); }
ok("the veil went up again", up);
await wait(1500);
await page.eval("(() => { document.querySelector('#ghost [data-stop]')?.click(); return 1; })()");
let gone = false;
for (let i = 0; i < 80; i++) { if (!(await page.eval("!!document.getElementById('ghost')"))) { gone = true; break; } await wait(300); }
ok("Stop mid-write takes it down — PLAN-07 bug 1, a failure must never trap anyone", gone);

console.log(red ? `  ${red} RED` : "  all green");
