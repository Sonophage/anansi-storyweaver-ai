// Every control a finger can reach is 44px across to the finger.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/targets.js
//
// The usability check of 2026-10-24 measured Close at 39x14, a Remove ✕ at 10x15 and step dots at
// 46x5. Seth's rule: about 32px to the eye, 44px to the finger. So this does not read sizes off the
// box — a box can be small on purpose. It asks the browser what a finger 21px from the middle of
// each control would land on, on every surface a writer opens on a phone. Landing on that control,
// or on another one, is fine: two controls closer than 44px have to share the gap. Landing on
// nothing a finger can press is the fault.
//
// Inline links inside a sentence are left out, as WCAG leaves them out: a word in a line of text
// cannot be 44px tall without breaking the line.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (m, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${m}${cond ? "" : "   <-- broken"}`); if (!cond) red++; };

await page.mobile();
await page.goto(B + "/");
await wait(900);

const probe = `(() => {
  const C = 'button, a[href], select, summary, [role=button], label, input[type=checkbox], input[type=radio]';
  const bad = [];
  for (const e of document.querySelectorAll(C)) {
    if (e.matches('a[href]') && e.closest('p, .hint, li')) continue;
    // A box inside a label is pressed through its label, and the label is measured on its own.
    if (e.matches('input') && e.closest('label')) continue;
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx >= innerWidth || cy >= innerHeight) continue;
    // Reachable now: the finger at its middle lands on it. A control under a sheet or scrolled
    // under the header is not a target on this screen.
    const mid = document.elementFromPoint(cx, cy);
    if (!mid || mid.closest(C) !== e) continue;
    const miss = [[-21, 0], [21, 0], [0, -21], [0, 21]].filter(([dx, dy]) => {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
      const h = document.elementFromPoint(x, y);
      // The header and the composer sit over the scrolling page. A control half under one of them
      // is scrolled, not small: scroll and it is whole again. Only a control OUTSIDE them: until
      // 2026-10-29 this excused every probe that landed on the header, so the header's own buttons
      // were never measured at all (a UX review measured Back at 29x31 and Read at 41x31).
      const over = h?.closest('#bar, #dock');
      if (over && !over.contains(e)) return false;
      return !h?.closest(C);
    });
    if (miss.length) bad.push(Math.round(r.width) + 'x' + Math.round(r.height) + ' '
      + (e.getAttribute('aria-label') || e.textContent || e.value || e.tagName).replace(/\\s+/g, ' ').trim().slice(0, 30)
      + ' [' + Object.keys(e.dataset).join(',') + ']');
  }
  return [...new Set(bad)];
})()`;
const check = async (where) => {
  const bad = await page.eval(probe);
  ok(`every control on ${where} is 44px to the finger (${bad.length} short${bad.length ? ': ' + JSON.stringify(bad) : ''})`, bad.length === 0);
};

await check("the library");
await page.click('#bar .hdoor[data-railview="workspace"]');
await wait(600);
await check("the main menu");

await page.goto(B + "/");
await wait(600);
await page.click("#page [data-open]");
await wait(1400);
const sid = (await page.eval("location.hash")).slice(1).split('/')[0];
ok(`a tale is open (${sid})`, !!sid);
await check("a tale");
await page.click("#col .block.newest .narr, #col .block.newest .said");
await wait(600);
await check("a passage's actions");
await page.eval("(() => { document.getElementById('scrim').click(); return 1; })()");
await wait(500);
await page.click('#bar .pill[data-railview="story"]');
await wait(600);
await check("the tale's menu");

for (const p of ['search', 'waiting', 'story', 'chapter', 'chapters', 'threads', 'strings', 'context', 'teller', 'anansi']) {
  await page.goto(B + "/#" + sid + "/" + p);
  await wait(900);
  await check(`the ${p} drawer`);
}
await page.goto(B + "/#" + sid);
await wait(900);
await page.click('#bar [data-appearance]');
await wait(600);
await check("the Look sheet");

console.log(red ? `\n  ${red} RED` : "\n  all green");
