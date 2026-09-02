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
    scr: t ? t.querySelectorAll('span.tw.scr').length : 0,
    lit: t ? t.querySelectorAll('span.tw.lit').length : 0,
    noiseColour: n ? getComputedStyle(n).color : null,
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
// Seth: "let the all the glyphs be in the accent color." Read off the computed style rather than
// the stylesheet, so a rule that is written and then overridden cannot pass this.
{
  const accent = await page.eval(
    "getComputedStyle(document.documentElement).getPropertyValue('--gold-dim').trim()");
  const asRGB = await page.eval(`(() => { const d = document.createElement('span');
    d.style.color = ${JSON.stringify(accent)}; document.body.appendChild(d);
    const c = getComputedStyle(d).color; d.remove(); return c; })()`);
  console.log("  glyph field colour: " + first?.noiseColour + "  accent: " + asRGB);
  ok("  the glyphs are in the accent colour", first != null && first.noiseColour === asRGB);
}
// Seth: "allow the words and the initial shape to be the same everytime and only the letters
// shift." Two rolls, 200ms apart, at ~11 rolls a second: the space positions must be identical and
// the letters must not be. Asserting BOTH halves — a field that never changed at all would satisfy
// the first on its own, and that is the failure the second one names.
{
  const roll = () => page.eval("document.querySelector('#ghost .noise')?.textContent ?? ''");
  const a = await roll(); await wait(200); const b = await roll();
  const gaps = (x) => [...x].map((c, i) => (c === ' ' ? i : -1)).filter((i) => i >= 0).join(',');
  console.log(`  field: ${a.length} chars, ${gaps(a).split(',').length} words`);
  ok("  the field keeps its shape between rolls", a.length > 0 && gaps(a) === gaps(b));
  ok("  and the letters inside it shift", a !== b);
}
const bareBlur = first?.dark;

// ---- 2. as the words arrive they take the glyphs' place, Stop goes, the ground darkens
// TWO SAMPLES, and keeping them apart is the point. `mid` is the last look while it was still
// writing; `last` is whatever it looked like at the end. The frontier of turning letters only
// exists mid-write — it is drained deliberately when nothing more is coming, so asserting it on the
// finished state tests the opposite of the feature.
let mid = null, last = null, sawWords = false, seen = [];
for (let i = 0; i < 400; i++) {
  const v = await veil();
  if (!v) break;
  last = v;
  if (v.words > 0 && !sawWords) { sawWords = true; }
  if (v.words > 0) { seen.push(v.words); if (!v.done) mid = v; }
  if (v.done) break;
  await wait(250);
}
console.log(`  mid-write: ${mid?.scr ?? '-'} turning, ${mid?.lit ?? '-'} settled`
  + `   ·  finished: ${last?.scr ?? '-'} turning, ${last?.lit ?? '-'} settled`);
console.log("  words: " + JSON.stringify(seen.slice(0, 8)) + (seen.length > 8 ? " …" : ""));
ok("the prose types itself in", sawWords && new Set(seen).size > 1);
ok("  in separate fading spans, not one blob", (mid?.spans ?? 0) > 5);
// Seth: "let the glyphs slowly transition letter by letter in the accent color. white when words
// actually form." So at any moment mid-write there is a short frontier of unsettled letters and a
// much longer settled body behind it.
ok("  with a turning frontier in front of settled letters",
   mid != null && mid.scr > 0 && mid.lit > mid.scr);
// Seth: "as the streaming starts the rest of the glyphs goes away with the exception of the current
// word." The held-open field is for before there is a passage; once there is one the only glyphs
// left are the frontier's. Falsify by not removing `.noise` in liveDelta — this goes red alone.
ok("  and the held-open field went with the first word", mid != null && mid.noise === 0);
ok("  and nothing is left turning once the passage is done", last != null && last.scr === 0);
ok("  Stop went with the glyphs once writing started", mid != null && mid.stopShown === false);
ok("  the veil darkened when the words came", mid != null && mid.dark !== bareBlur);
// Seth: "the view screen should stay at the top so the user can read."
ok("  and the view stayed at the top rather than chasing the tail", mid != null && mid.top === 0);

// ---- 3. it holds when the passage is done, and typing is the way out
const done = last;
ok("the veil holds after the passage finishes", done != null && done.done === true);
ok("  the glyph field is still gone at the end", done != null && done.noise === 0);
ok("  and the passage landed on the page behind it",
   (await page.eval("document.querySelectorAll('#col .block').length")) > 0);
// A REAL key event, not a synthetic one. The first version of this check dispatched a
// KeyboardEvent by hand and passed while the feature was broken for anyone on a phone — see the
// input-event case below, which is what actually reported it.
await page.key('q', 81);
await wait(1200);
ok("typing takes the veil away", (await page.eval("!!document.getElementById('ghost')")) === false);
ok("  and the letter lands in the composer",
   (await page.eval("document.getElementById('input').value")) === "q");

// ---- 3b. THE PATH WITH NO USABLE KEYDOWN, which is every soft keyboard, every IME, and paste.
// A phone reports `key: 'Unidentified'` with keyCode 229 and does its work through composition, so
// a handler reading `e.key.length === 1` never fires: the character lands in the composer under the
// veil and the veil stays. Seth: "typing falls in input but its not getting rid of the veil."
// Falsify by removing the delegated `input` listener in web/app.js — this goes red and nothing else
// does, because the keydown path above still passes.
await send("Third time.");
for (let i = 0; i < 200; i++) { if (await page.eval("!!document.querySelector('#ghost.done')")) break; await wait(300); }
ok("the veil is up again to be dismissed the other way",
   await page.eval("!!document.getElementById('ghost')"));
await page.eval(`(() => { const i = document.getElementById('input');
  i.value = 'z'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
await wait(1200);
ok("  text entering the composer takes the veil away, whatever typed it",
   (await page.eval("!!document.getElementById('ghost')")) === false);
ok("  and nothing was added on top of what landed",
   (await page.eval("document.getElementById('input').value")) === "z");

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
