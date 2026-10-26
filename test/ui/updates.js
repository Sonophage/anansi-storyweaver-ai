// The update report (#76): a page per tale that says what an update moved, in the writer's words.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/updates.js
//
// The Silver Key has nothing on it. A Tale In Chapters has one line, seeded the way a migration
// writes it (test/ui/seed.ts): a backup, then the line, naming a thread.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (m, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${m}${cond ? "" : "   <-- broken"}`); if (!cond) red++; };
const until = async (expr, n = 40, ms = 250) => { for (let i = 0; i < n; i++) { if (await page.eval(expr)) return true; await wait(ms); } return false; };
const sidOf = (title) => page.eval(`(async () => (await (await fetch('/api/stories')).json()).stories.find((s) => s.title === ${JSON.stringify(title)}).id)()`);
const body = () => page.eval("document.getElementById('sideBody')?.innerText ?? ''");

const key = await sidOf('The Silver Key');
const acts = await sidOf('A Tale In Chapters');

// ---- reached from the tale: Tale, Keep, then the report
await page.goto(B + "/#" + key + "/story");
for (let i = 0; i < 40 && !(await page.visible('[data-storytab="keep"]')); i++) await wait(250);
await page.click('[data-storytab="keep"]');
ok("Tale → Keep has a way to the update report", await until("!!document.querySelector('[data-panel=\"updates\"]')?.offsetParent", 20));
await page.eval("(() => { document.querySelector('[data-panel=\"updates\"]')?.click(); return 1; })()");
ok("  which opens it", await until("document.getElementById('sideHead')?.innerText.includes('What the update moved')", 20));
ok(`  and a tale nothing moved in says so (${JSON.stringify((await body()).slice(0, 80))})`, /Nothing has moved in this tale/.test(await body()));

// ---- a tale with a line
await page.goto(B + "/#" + acts + "/updates");
ok("a tale with a line shows it", await until("/His Facts moved into Always true/.test(document.getElementById('sideBody')?.innerText ?? '')", 20));
ok("  with the thread it was about, as a link", await page.eval("!!document.querySelector('#sideBody [data-entry=\"e-report-aldis\"]')"));
const text = await body();
ok(`  when the backup was taken (${JSON.stringify(text.match(/backup[^\n]*/i)?.[0] ?? null)})`, /backup was taken/i.test(text));
ok("  and, inside the first week, how to put the library back", /put the library back/i.test(text) && /anansi-.*\.db/.test(text));
await page.eval("(() => { document.querySelector('#sideBody [data-entry=\"e-report-aldis\"]')?.click(); return 1; })()");
ok("the link opens the thread", await until("document.getElementById('sideBody')?.innerText.includes('Aldis Fen') && !document.getElementById('sideHead')?.innerText.includes('What the update moved')", 20));

console.log(red ? `\n  ${red} RED` : "\n  all green");
