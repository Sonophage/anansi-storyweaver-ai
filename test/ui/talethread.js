// The tale's own thread (#75): the first card in Threads, holding the premise and setting, the Voice,
// the tale's Rules, and instructions of the writer's own, which reach the model while switched on.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/talethread.js
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (m, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${m}${cond ? "" : "   <-- broken"}`); if (!cond) red++; };
const until = async (expr, n = 40, ms = 250) => { for (let i = 0; i < n; i++) { if (await page.eval(expr)) return true; await wait(ms); } return false; };
const view = (sid) => page.eval(`(async () => JSON.stringify(await (await fetch('/api/story?story=${sid}')).json()))()`).then(JSON.parse);
const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find((s) => s.title === 'The Silver Key').id)()");

await page.goto(B + "/#" + sid + "/threads");
await until("!!document.querySelector('[data-taleopen]')");
ok("the tale's own thread is the first card in Threads",
   await page.eval("(() => { const t = document.querySelector('#sideBody [data-taleopen]'), l = document.getElementById('thlist'); return !!t && !!l && !!(t.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING); })()"));
await page.eval("(() => { document.querySelector('#sideBody [data-taleopen]')?.click(); return 1; })()");
await until("!!document.querySelector('.taleface')");
const face = await page.eval("(document.querySelector('.taleface')?.innerText ?? '').toLowerCase()");
ok("it holds Always true (the premise and setting), the Voice, Rules and Your own",
   ['always true', 'premise', 'setting', 'voice', 'rules', 'your own'].every((w) => face.includes(w)));

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
