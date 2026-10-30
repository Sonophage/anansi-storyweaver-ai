// The tale's own thread (#75): the Thread tab of the Tale panel (2026-10-29), holding where the tale stands, the tale's Rules, its strings, and instructions of the
// writer's own, which reach the model while switched on.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/talethread.js
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (m, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${m}${cond ? "" : "   <-- broken"}`); if (!cond) red++; };
const until = async (expr, n = 40, ms = 250) => { for (let i = 0; i < n; i++) { if (await page.eval(expr)) return true; await wait(ms); } return false; };
const view = (sid) => page.eval(`(async () => JSON.stringify(await (await fetch('/api/story?story=${sid}')).json()))()`).then(JSON.parse);
const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find((s) => s.title === 'The Silver Key').id)()");

// Not on the Threads list any more (Seth, 2026-10-29): it lives on the Tale panel's Thread tab.
await page.goto(B + "/#" + sid + "/threads");
await until("!!document.getElementById('thlist')");
ok("the tale's own thread is not a card in Threads", await page.eval("!document.querySelector('#sideBody [data-taleopen], #sideBody .talebanner')"));
await page.goto(B + "/#" + sid + "/story");
await until("!!document.querySelector('[data-storytab=\"thread\"]')");
await page.click('[data-storytab="thread"]');
await until("document.querySelector('[data-tab]')?.dataset.tab === 'thread'");
const face = await page.eval("(document.querySelector('.sgroup[data-group=\"thread\"]')?.innerText ?? '').toLowerCase()");
ok("it opens the Thread tab of the Tale panel, holding where the tale stands, Rules, the strings and Your own",
   ['where the tale stands', 'rules', 'promises', 'open questions', 'your own'].every((w) => face.includes(w)));
ok("  and only that group is on screen", await page.eval(
  "[...document.querySelectorAll('.sgroup')].filter(g => getComputedStyle(g).display !== 'none').map(g => g.dataset.group).join(',') === 'thread'"));

// ---- an instruction of the writer's own, which reaches the model
await page.eval(`(() => { document.querySelector('[data-talenew="name"]').value = 'Slow burn';
  document.querySelector('[data-talenew="body"]').value = 'Nobody touches before scene ten.';
  document.querySelector('[data-addtalepocket]').click(); return 1; })()`);
await wait(1200);
const v = await view(sid);
ok("adding one keeps it on the tale, switched on", v.talePockets?.some((a) => a.name === 'Slow burn' && a.active));
const m = await page.eval(`(async () => JSON.stringify(await (await fetch('/api/manifest', { method: 'POST',
  headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storyId: ${JSON.stringify(sid)} }) })).json()))()`).then(JSON.parse);
ok("  and it is in what Anansi reads", JSON.stringify(m).includes('Nobody touches before scene ten.'));

console.log(red ? `\n  ${red} RED` : "\n  all green");
