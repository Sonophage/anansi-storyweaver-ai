// The tale's own thread (#75): its own row in the tale's menu, beside Tale (2026-11-03), holding where the tale stands, the tale's Rules, its strings, and instructions of the
// writer's own, which reach the model while switched on.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/talethread.js
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (m, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${m}${cond ? "" : "   <-- broken"}`); if (!cond) red++; };
const until = async (expr, n = 40, ms = 250) => { for (let i = 0; i < n; i++) { if (await page.eval(expr)) return true; await wait(ms); } return false; };
const view = (sid) => page.eval(`(async () => JSON.stringify(await (await fetch('/api/story?story=${sid}')).json()))()`).then(JSON.parse);
const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find((s) => s.title === 'The Silver Key').id)()");

// Not on the Threads list any more (Seth, 2026-10-29). It was the Tale panel's Thread tab until
// 2026-11-03, and is a row of the tale's menu now.
await page.goto(B + "/#" + sid + "/threads");
await until("!!document.getElementById('thlist')");
ok("the tale's own thread is not a card in Threads", await page.eval("!document.querySelector('#sideBody [data-taleopen], #sideBody .talebanner')"));
await page.goto(B + "/#" + sid);
await until("!!document.querySelector('#bar [data-railview=\"story\"]')");
await page.click('#bar [data-railview="story"]');
await until("!!document.querySelector('#rail [data-nav=\"talethread\"]')");
ok("the tale's menu has The tale's thread beside Tale", await page.eval(
  "(() => { const t = [...document.querySelectorAll('#rail .taletiles [data-nav]')].map((b) => b.dataset.nav); return t[0] === 'story' && t[1] === 'talethread'; })()"));
await page.click('#rail [data-nav="talethread"]');
await until("/where the tale stands/i.test(document.getElementById('sideBody')?.innerText ?? '')");
const face = await page.eval("(document.getElementById('sideBody')?.innerText ?? '').toLowerCase()");
ok("it opens the tale's thread, holding where the tale stands, Rules, the strings and Your own",
   ['where the tale stands', 'rules', 'promises', 'open questions', 'your own'].every((w) => face.includes(w)));

// ---- an instruction of the writer's own, which reaches the model. One ＋ on the tab opens the pocket
// panel (Seth, 2026-10-30); Your own is one of its kinds.
await page.click('#sideBody [data-taleadd]');
await until("!document.getElementById('pocketPanel').hidden");
await page.click('#pocketPanel [data-pocketkind="instruction"]');
await page.eval(`(() => { for (const [id, v] of [['pk-name', 'Slow burn'], ['pk-body', 'Nobody touches before scene ten.']]) {
  const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } return 1; })()`);
await page.click('#pocketPanel [data-pocketsave]');
await wait(1200);
ok("the ＋ adds one of your own, and the panel shuts", await page.eval("document.getElementById('pocketPanel').hidden"));
ok("  and it is a row on the tab that opens with a tap", await page.eval(
  "[...document.querySelectorAll('#sideBody .pocketopen')].some((b) => /Slow burn/.test(b.textContent))"));
const v = await view(sid);
ok("adding one keeps it on the tale, switched on", v.talePockets?.some((a) => a.name === 'Slow burn' && a.active));
const m = await page.eval(`(async () => JSON.stringify(await (await fetch('/api/manifest', { method: 'POST',
  headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storyId: ${JSON.stringify(sid)} }) })).json()))()`).then(JSON.parse);
ok("  and it is in what Anansi reads", JSON.stringify(m).includes('Nobody touches before scene ten.'));

console.log(red ? `\n  ${red} RED` : "\n  all green");
