// needs: dead-model
// What a usability walkthrough of hemming a scene at phone size found (2026-10-30), checked where a
// writer sees it: the strip's "what is in it" kept to one line, and one gold press on the new scene.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/walkthrough.js
//
// DEAD MODEL ON PURPOSE. It hems a scene to reach a blank one, and the hem's passes would otherwise
// go to the real model; with nothing listening they fail at once and the scene still closes.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (m, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${m}${cond ? "" : "   <-- broken"}`); if (!cond) red++; };
const until = async (expr, n = 40, ms = 250) => { for (let i = 0; i < n; i++) { if (await page.eval(expr)) return true; await wait(ms); } return false; };
const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find((s) => s.title === 'The Silver Key').id)()");
await page.mobile(390, 844);

// ---- THE STRIP UNDER THE HEADER, OPEN, ON THE WORKBENCH. "what is in it ›" was squeezed to 45px and
// wrapped to three lines. One line is under 20px at its 11px type.
await page.goto(B + "/#" + sid + "/waiting");
await until("!!document.querySelector('[data-ctxtoggle]')");
await page.eval("(() => { if (document.querySelector('[data-ctxtoggle]')?.getAttribute('aria-expanded') !== 'true') document.querySelector('[data-ctxtoggle]').click(); return 1; })()");
await until("!!document.querySelector('#ctxread [data-panel=\"context\"]')");
const strip = await page.eval(`JSON.stringify((() => { const s = document.getElementById('ctxread');
  const b = s.querySelector('[data-panel="context"]'), r = b.getBoundingClientRect();
  return { h: Math.round(r.height), w: Math.round(r.width), over: s.scrollWidth - s.clientWidth }; })())`).then(JSON.parse);
ok(`STRIP-ONE-LINE: "what is in it" is on one line (${strip.w}x${strip.h}px)`, strip.h > 0 && strip.h < 20);
ok(`  and the strip does not run off the screen sideways (${strip.over}px over)`, strip.over <= 0);

// ---- ONE GOLD PRESS ON A NEW SCENE (ADR 0004). A blank scene opens with the composer showing, and
// it had three gold things: Full screen filled, Send filled, and the box ringed in gold.
await page.eval(`(async () => { await fetch('/api/chapter/end', { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ storyId: ${JSON.stringify(sid)} }) }); return 1; })()`);
await page.goto(B + "/#" + sid);
await page.eval("location.reload()");
await until("!!document.getElementById('send') && document.getElementById('send').getBoundingClientRect().width > 0");
await wait(800);
const gold = await page.eval(`JSON.stringify((() => {
  const probe = document.createElement('div'); probe.style.background = 'var(--gold)'; probe.style.borderColor = 'var(--gold-dim)';
  document.body.append(probe);
  const g = getComputedStyle(probe).backgroundColor, dim = getComputedStyle(probe).borderTopColor; probe.remove();
  document.activeElement?.blur();
  const seen = (el) => { const r = el.getBoundingClientRect(); if (!r.width) return false;
    const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!at && (at === el || el.contains(at)); };
  const filled = [...document.querySelectorAll('button')].filter((b) => seen(b) && getComputedStyle(b).backgroundColor === g)
    .map((b) => b.getAttribute('aria-label') || b.textContent.trim());
  const wrap = document.getElementById('inputWrap'), edge = wrap && getComputedStyle(wrap).borderTopColor;
  return { filled, ringed: !!edge && (edge === g || edge === dim), edge }; })())`).then(JSON.parse);
ok(`ONE-GOLD: the new scene has one filled gold button, and it is Send (${JSON.stringify(gold.filled)})`,
   gold.filled.length === 1 && gold.filled[0] === 'Send');
ok(`  and the box is not ringed in gold while you are not in it (${gold.edge})`, !gold.ringed);

console.log(red ? `\n  ${red} RED` : "\n  all green");
