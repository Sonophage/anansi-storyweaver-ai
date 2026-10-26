// Places (#80): a kind of thread of its own, listed under Places, and sorted out of Lore by the
// writer on the update report — never by guessing.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/places.js
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (m, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${m}${cond ? "" : "   <-- broken"}`); if (!cond) red++; };
const until = async (expr, n = 40, ms = 250) => { for (let i = 0; i < n; i++) { if (await page.eval(expr)) return true; await wait(ms); } return false; };
const view = (sid) => page.eval(`(async () => JSON.stringify(await (await fetch('/api/story?story=${sid}')).json()))()`).then(JSON.parse);

const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find((s) => s.title === 'The Silver Key').id)()");
let v = await view(sid);
const lore = v.entries.find((e) => e.entryType === 'lore');
ok(`the fixture has a Lore thread to sort (${lore?.title})`, !!lore);

// ---- the report offers it, and one press makes it a place
await page.goto(B + "/#" + sid + "/updates");
await until(`!!document.querySelector('[data-makeplace="${lore.id}"]')`);
ok("the update report lists the Lore threads, each with This is a place",
   await page.eval(`!!document.querySelector('[data-makeplace="${lore.id}"]')`));
await page.eval(`(() => { document.querySelector('[data-makeplace="${lore.id}"]')?.click(); return 1; })()`);
await wait(1000);
v = await view(sid);
ok("  and the press makes it a place", v.entries.find((e) => e.id === lore.id)?.entryType === 'place');

// ---- Threads lists it under Places
await page.goto(B + "/#" + sid + "/threads");
await until("!!document.querySelector('[data-kindhead]')");
const heads = await page.eval("JSON.stringify([...document.querySelectorAll('[data-kindhead]')].map((h) => h.dataset.kindhead))").then(JSON.parse);
ok(`Threads has a Places group (${heads})`, heads.includes('place'));
ok("  holding it", await page.eval(`!!document.querySelector('[data-kindrows="place"] [data-entry="${lore.id}"]')`));

// ---- and New thread offers Places
await page.eval("(() => { document.querySelector('[data-newlore]')?.click(); return 1; })()");
await until("!!document.querySelector('[data-lorekind]')");
ok("New thread offers Places", await page.eval("!!document.querySelector('[data-lorekind=\"place\"]')"));

console.log(red ? `\n  ${red} RED` : "\n  all green");
