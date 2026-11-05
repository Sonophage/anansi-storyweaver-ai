// needs: fake-router
// Talk's cards (#151, #159): a change the writer asked for is a done card with Undo, and what Anansi
// offered unasked is the Workbench's chalked card in the conversation, through the real POST /api/talk
// and the fake router. Undo puts the voice back; Sew it in makes the offered thread.
//
//   bash test/ui/run.sh talkcards
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (m, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${m}${cond ? "" : "   <-- broken"}`); if (!cond) red++; };
const until = async (expr, n = 60, ms = 100) => { for (let i = 0; i < n; i++) { if (await page.eval(expr)) return true; await wait(ms); } return false; };
const view = (sid) => page.eval(`(async () => JSON.stringify(await (await fetch('/api/story?story=${sid}')).json()))()`).then(JSON.parse);
const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find((s) => s.title === 'The Silver Key').id)()");
const voiceOf = async () => ((await view(sid)).entries.find((e) => e.title === 'Marek Vale')?.addons ?? [])
  .find((a) => a.slot === 'voice')?.body ?? null;

const press = (sel) => page.eval(`(() => { document.querySelector(${JSON.stringify(sel)})?.click(); return 1; })()`);
await page.goto(B + "/#" + sid);
await until("!!document.getElementById('nextbar')");
if (await page.eval("!!document.getElementById('dock')?.classList.contains('folded')")) { await press('#quill'); await wait(250); }
await page.mode('talk');
ok("Talk opens on the tale", await until("!!document.getElementById('input')?.offsetParent && document.getElementById('dock').classList.contains('talking')"));
const was = await voiceOf();
await page.eval(`(() => { const i = document.getElementById('input'); i.value = 'Give Marek a slow voice';
  i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
await press('#send');
ok("CARDS-DONE: the asked change is a done card, named for Marek, with Undo",
   await until("[...document.querySelectorAll('#talkthread .deckcard[data-deckkind=\"done\"]')].some((c) => /Marek/.test(c.textContent) && c.querySelector('[data-talkundo]'))", 80));
ok("CARDS-WRITTEN: and his voice is written", (await voiceOf()) === 'Slow, and every word counted.');
ok("CARDS-CHALK: the offer is a chalked card with Sew it in",
   await page.eval("[...document.querySelectorAll('#talkthread .deckcard[data-deckkind=\"chalk\"]')].some((c) => /Lamplighter/.test(c.textContent) && c.querySelector('[data-deckall=\"accept\"]'))"));
ok("  and it is not made until it is sewn in", !(await view(sid)).entries.some((e) => e.title === 'The Lamplighter'));

await press('#talkthread .deckcard[data-deckkind="done"] [data-talkundo]');
const settles = async (f) => { for (let i = 0; i < 40; i++) { if (await f()) return true; await wait(100); } return false; };
ok("CARDS-UNDO: Undo puts his voice back", await settles(async () => (await voiceOf()) === was));
ok("  and the card says it was undone", await until("/Undone/.test(document.getElementById('talkthread')?.textContent ?? '')"));

await press('#talkthread .deckcard[data-deckkind="chalk"] [data-deckall="accept"]');
ok("CARDS-SEW: Sew it in makes the offered thread", await settles(async () => (await view(sid)).entries.some((e) => e.title === 'The Lamplighter')));

console.log(red ? `\n  ${red} red` : '\n  all green');
