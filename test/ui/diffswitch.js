// THE DIFF'S WAS / NOW SWITCH (2026-10-29, option D of the design canvas): it opens on Now, a press on
// Was shows the old text with the removed words marked, and the press repaints nothing.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/diffswitch.js
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (m, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${m}${cond ? "" : "   <-- broken"}`); if (!cond) red++; };
await page.mobile();
await page.goto(B + "/");
await wait(900);
// The one renderer, placed on the page, so the app's own stylesheet and click handler act on it.
await page.eval(`(async () => { const m = await import('/web/model.js');
  const d = document.createElement('div'); d.id = 'difftest'; d.style.cssText = 'position:fixed; inset:80px 16px auto 16px; z-index:99; background:var(--sheet); padding:12px';
  d.innerHTML = m.diffHTML('She has not told anyone about the kiss.', 'She has told Lisa about the kiss.');
  document.body.appendChild(d); return 1; })()`);
await wait(300);
const shown = () => page.eval(`(() => { const v = (s) => { const e = document.querySelector('#difftest ' + s); return !!e && getComputedStyle(e).display !== 'none'; };
  return JSON.stringify({ now: v('.dnow'), was: v('.dwas'), view: document.querySelector('#difftest .diff')?.dataset.view }); })()`).then(JSON.parse);
let s = await shown();
ok(`DIFF-OPENS-NOW: it opens on the new text alone (${JSON.stringify(s)})`, s.now && !s.was && s.view === 'now');
await page.click('#difftest [data-diffview="was"]');
await wait(300);
s = await shown();
ok(`DIFF-WAS: a press on Was shows the old text alone (${JSON.stringify(s)})`, s.was && !s.now);
ok("  with the removed words marked", /not/.test(await page.eval("[...document.querySelectorAll('#difftest .dwas del')].map((x) => x.textContent).join(' ')")));
ok("  and Was reads as pressed", await page.eval("document.querySelector('#difftest [data-diffview=\"was\"]').getAttribute('aria-pressed') === 'true'"));
await page.click('#difftest [data-diffview="now"]');
await wait(300);
s = await shown();
ok("DIFF-NOW: and Now brings the new text back", s.now && !s.was);
const box = JSON.parse(await page.eval("JSON.stringify(document.querySelector('#difftest [data-diffview=\"was\"]').getBoundingClientRect())"));
ok(`  each press is big enough to hit (${Math.round(box.width)}x${Math.round(box.height)})`, box.width >= 44 && box.height >= 30);
console.log(red ? `\n  ${red} RED` : "\n  all green");
