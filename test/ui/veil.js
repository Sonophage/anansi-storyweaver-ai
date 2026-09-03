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
const veil = () => page.eval(`(() => {
  const g = document.getElementById('ghost'); if (!g) return null;
  const t = g.querySelector('.veiltext'), b = g.querySelector('.veilstop');
  const fill = g.querySelector('.veilmeter i');
  return JSON.stringify({
    words: t ? t.querySelectorAll('span.w').length : 0,
    tip: t ? t.querySelectorAll('span.w.tip').length : 0,
    chars: t ? t.textContent.length : 0,
    held: t ? t.innerHTML.length : 0,
    stopShown: b ? getComputedStyle(b).display !== 'none' : false,
    // The bar above Stop: present and travelling while she writes, gone when she is done.
    // The pair of presses on the finished passage: none while writing, two when done.
    carry: (() => { const row = g.querySelector('.veilcarry');
      if (!row || getComputedStyle(row).display === 'none') return 0;
      return row.querySelectorAll('button[data-veilgo]').length; })(),
    // THE RING AROUND THE WINDOW, which belongs to the WAIT: up from the press, gone on the first
    // word. It is on the root and outside the veil, so it is read from there.
    ring: (() => { const f = document.getElementById('frame');
      if (!f) return 'MISSING';
      const cs = getComputedStyle(f);
      return cs.opacity === '0' ? 'gone' : (cs.animationName !== 'none' ? 'moving' : 'still'); })(),
    streaming: document.documentElement.dataset.streaming === '1',
    dark: getComputedStyle(g).backgroundColor,
    meter: fill ? parseFloat(fill.style.height) || 0 : -1,
    top: t ? t.scrollTop : -1,
    // Where the first line actually sits, and how tall the window is. The prose grows downwards
    // from a locked top; a centred block moves what is already written, which is what this catches.
    rectTop: t ? Math.round(t.getBoundingClientRect().top) : -1, vh: window.innerHeight,
    serif: t ? getComputedStyle(t).fontSize : null,
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

// ---- 1. before the first token: nothing held open, the tint already there, Stop offered
await send("The rain does not stop.");
let first = null;
for (let i = 0; i < 60; i++) { first = await veil(); if (first) break; await wait(100); }
ok("the veil goes up on the press", first != null);
// The 2026-09-02 handoff removes the opening screen outright — no web, no glyph grid, no field of
// noise standing in for prose that has not been written. Asserted on the RENDERED length, not on a
// class: a surface that held anything would have markup in it.
ok("  with nothing standing in for the passage", first != null && first.held === 0 && first.chars === 0);
ok("  and Stop offered from the first frame", first != null && first.stopShown === true);
// The tint used to arrive with the words. It arrives with the veil now, so the page behind is
// already down to a ground rather than turning into one while the writer is reading.
ok("  and the ground already dark, not waiting for the words",
   first != null && /rgba?\(/.test(first.dark) && first.dark !== 'rgba(0, 0, 0, 0)');
ok("  the prose is set at the handoff's 22px", first != null && first.serif === '22px');
// AND THE RING IS UP FOR THE WAIT. This is the half that makes the "gone once streaming" check
// below mean anything: a ring that never appeared would satisfy that one on its own. The wait is
// the one stretch of a generation with nothing to look at — F24 measured the cold prefill at 7.3s
// — so it is the stretch the ring exists for.
ok(`  and the ring is up around the window, travelling (${first && first.ring})`,
   first != null && first.ring === 'moving' && first.streaming === false);

// ---- 2. the words focus in, the accent trails them, the rule fills, Stop stays
let mid = null, last = null, seen = [], tips = new Set(), meters = [], tops = [];
for (let i = 0; i < 400; i++) {
  const v = await veil();
  if (!v) break;
  last = v;
  if (v.words > 0) { seen.push(v.words); meters.push(v.meter); tops.push(v.rectTop); if (!v.done) { mid = v; tips.add(v.tip); } }
  if (v.done) break;
  await wait(250);
}
console.log("  words: " + JSON.stringify(seen.slice(0, 8)) + (seen.length > 8 ? " …" : ""));
console.log("  meter: " + JSON.stringify(meters.slice(0, 8).map((x) => Math.round(x))) + " …");
ok("the prose arrives word by word", seen.length > 1 && new Set(seen).size > 1);
// Seth's handoff: "the last three words stay in the accent". A tail, so it has to LET GO — a
// version that only ever added the class would sit at three and pass a naive count, which is why
// this asserts the ceiling rather than the presence.
console.log("  accent tail widths seen: " + JSON.stringify([...tips].sort((a, b) => a - b)));
ok("  with an accent tail that never grows past three",
   tips.size > 0 && Math.max(...tips) <= 3 && Math.max(...tips) > 0);
// The meter has no honest denominator, so it is asymptotic — it must climb and must never reach
// the end before the passage does.
ok("  and a rule that climbs without ever arriving early",
   meters.length > 1 && Math.max(...meters) > Math.min(...meters) && mid != null && mid.meter < 100);
// The handoff is explicit: Stop stays for the WHOLE write. It used to hide at the first word, a
// rule written for a surface whose words began after a waiting screen.
ok("  Stop stayed up the whole time she was writing", mid != null && mid.stopShown === true);
// THE RING IS THE WAIT'S, AND THE WAIT ONLY — Seth, 2026-09-02: "Remove the border around the ghost
// as soon as something starts streaming." Once words are arriving they say it better than a border,
// so by the time this loop has seen a word the ring must be gone. Asserted against `streaming`
// rather than as a bare "it is gone", because gone-because-it-never-came-up would pass that.
ok(`  the ring is gone once the words are arriving (${mid && mid.ring}, streaming ${mid && mid.streaming})`,
   mid != null && mid.streaming === true && mid.ring === 'gone');
// Seth: "the view screen should stay at the top so the user can read."
ok("  and the view stayed at the top rather than chasing the tail", mid != null && mid.top === 0);
// Seth, 2026-09-02: "the position should be locked." The surface was centred, so every new line
// lifted the passage by half a line and the sentence being read crept upwards for the whole write.
// MEASURED ACROSS SAMPLES, not once: a single reading cannot see drift, and the drift was the bug.
console.log("  first line at y: " + JSON.stringify([...new Set(tops)]) + " of " + (last?.vh ?? "?"));
ok("  and the first line never moved while she wrote",
   tops.length > 1 && new Set(tops).size === 1);
// And it starts near the TOP of the window — Seth changed his mind an hour after asking for the
// middle: "lets pin this to the top of the screen instead." 12vh, within a pixel of rounding.
ok("  starting near the top of the window, not centred",
   last != null && Math.abs(tops[0] - last.vh * 0.12) <= 2);

// ---- 3. it holds when the passage is done, and typing is the way out
const done = last;
ok("the veil holds after the passage finishes", done != null && done.done === true);
ok("  the rule is full and the accent has let go",
   done != null && done.meter === 100 && done.tip === 0);
ok("  and Stop is gone, because there is nothing left to stop", done != null && done.stopShown === false);
// AND THE TWO PRESSES ARRIVE IN ITS PLACE — Seth, 2026-09-02: "In the ghost add the regenerate and
// continue buttons there as well." Asserted as ABSENT while she wrote and PRESENT once she stopped:
// offering to re-roll a passage that does not exist yet, or to continue from it, is the state this
// catches. And they carry data-veilgo rather than data-re/data-continue on purpose — both have to
// take the veil away first or the finished passage never lands, so the attribute names that.
ok(`  and Regenerate and Continue arrive in its place (${done && done.carry})`,
   done != null && done.carry === 2);
ok("  which were NOT offered while she was still writing", mid != null && mid.carry === 0);
// And the ring is still gone at the end, because the call is over.
ok(`  and the ring is still gone (${done && done.ring})`, done != null && done.ring === 'gone');
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

// ---- 3c. A TAP TAKES IT AWAY TOO, and the page does not change until it does.
// Seth: "let a tap remove the veil as well. dont send the content to the main page until that tap
// happens." Both halves asserted: a passage count that never moves would pass the second on its
// own, so the first is the one that says the deferral is real rather than broken.
await send("A fourth.");
// THE BASELINE IS TAKEN ONCE THE VEIL IS UP, not when send was pressed. In Speak, Act and Narrate
// the writer's own line goes on the page before the model is asked — `generate` does api.write,
// api.story and paint() ahead of ghost() — so a count taken at the press moves for a reason that
// has nothing to do with what is being tested here.
for (let i = 0; i < 60; i++) { if (await page.eval("!!document.getElementById('ghost')")) break; await wait(100); }
await wait(400);
const before = await page.eval("document.querySelectorAll('#col .block').length");
for (let i = 0; i < 200; i++) { if (await page.eval("!!document.querySelector('#ghost.done')")) break; await wait(300); }
const during = await page.eval("document.querySelectorAll('#col .block').length");
console.log(`  blocks: ${before} while writing, ${during} at the end of it`);
ok("the passage did NOT land on the page while the veil was up", during === before);
await page.click('#ghost .veiltext');
await wait(1400);
ok("a tap takes the veil away", (await page.eval("!!document.getElementById('ghost')")) === false);
ok("  and the passage arrives all at once when it goes",
   (await page.eval("document.querySelectorAll('#col .block').length")) > before);

// ---- 3d. TWO REACHABLE STOPS MID-WRITE, which is what the handoff's "Stop hole" section asks for.
// The veil keeps its own for the whole write now; and leaving the veil early must still leave one,
// because #send was a DISABLED Send until 2026-09-02 and there was a window with no Stop at all.
// Falsify by reverting #send to the disabled-Send branch in drawDock: the second of these goes red.
await send("A fifth, and stop it.");
for (let i = 0; i < 80; i++) { if ((await veil())?.written) break; await wait(150); }
ok("the veil keeps its own Stop while the words arrive",
   (await veil())?.stopShown === true);
await page.eval("(() => { document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); return 1; })()");
await wait(250);
ok("  and leaving the veil mid-write hands Stop back to the composer",
   await page.eval("!!document.querySelector('#send[data-stop]')"));
// THE HANDOFF IS ASSERTED HERE; THE ABORT IS ASSERTED IN model.js. Pressing that Stop from here is
// a race and was one: the remaining decode can finish while the dismissal animates, Stop correctly
// becomes Send again, and the click throws on a button that was right to go. model.js §1b stops a
// generation in the one deterministic window on this box — the ~1.7s of prefill before the first
// token, using the veil's own Stop. Two scenarios, two windows, neither faking the other's.
for (let i = 0; i < 60 && (await page.eval("document.getElementById('send')?.dataset?.stop === '1'")); i++) await wait(250);

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
