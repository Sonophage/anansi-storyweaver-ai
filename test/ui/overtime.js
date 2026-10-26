// Over time (#78, ADR 0005): a thread's text is where it stands from scene 1, and each later entry
// is the whole of where it stands from its scene on. The screens show the one in force at the scene
// being written as "where it stands now", edit that one in place, and list every entry in Over time
// with its scene, its label and what it changed. The word Info is on no screen.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/overtime.js
//
// The fixture's Marek has an entry from scene 4, after the current scene 3, so it is not in force.
// One from scene 2 is added here: at scene 3 that is where he stands.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (m, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${m}${cond ? "" : "   <-- broken"}`); if (!cond) red++; };
const until = async (expr, n = 40, ms = 250) => { for (let i = 0; i < n; i++) { if (await page.eval(expr)) return true; await wait(ms); } return false; };
const view = (sid) => page.eval(`(async () => JSON.stringify(await (await fetch('/api/story?story=${sid}')).json()))()`).then(JSON.parse);
const post = (path, body) => page.eval(`(async () => JSON.stringify(await (await fetch(${JSON.stringify(path)}, { method: 'POST',
  headers: { 'content-type': 'application/json' }, body: ${JSON.stringify(JSON.stringify(body))} })).json()))()`).then(JSON.parse);
const text = (sel) => page.eval(`(document.querySelector(${JSON.stringify(sel)})?.innerText ?? '')`);

const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find((s) => s.title === 'The Silver Key').id)()");
let v = await view(sid);
const marek = v.entries.find((e) => e.title === 'Marek Vale');
const base = marek.body;
ok(`the fixture's scene is 3 and Marek's later entry opens at 4 (${v.currentChapter.index}, ${marek.states.map((s) => s.fromChapter)})`,
   v.currentChapter.index === 3 && marek.states.some((s) => s.fromChapter === 4));
await post('/api/state', { storyId: sid, entryId: marek.id, state: { fromChapter: 2, label: 'owes the crowns',
  body: `${base.replace(/\]$/, '')}; owed eleven crowns by Aldis Fen]`, beforeMode: 'hide' } });
v = await view(sid);
const two = v.entries.find((e) => e.id === marek.id).states.find((s) => s.fromChapter === 2);
ok("  and he gets an entry from scene 2", !!two);

// ---- Read: where he stands now is the scene 2 entry, not the base and not the scene 4 one
await page.goto(B + "/#" + sid + "/threads");
await until(`!!document.querySelector('[data-entry="${marek.id}"]')`);
await page.eval(`(() => { document.querySelector('[data-entry="${marek.id}"]').click(); return 1; })()`);
await until("!!document.querySelector('#sideBody .readface')");
const read = (await text('#sideBody .readface')).toLowerCase();
ok(`Read: "where it stands now" is shown (${JSON.stringify(read.slice(0, 120))})`, read.includes('where it stands now'));
ok("  as the entry in force at scene 3, from scene 2", read.includes('owed eleven crowns') && read.includes('from scene 2'));
ok("  and not the scene 4 entry, which has not opened", !read.includes('for the first time'));
ok("  and no Info anywhere", !/\binfo\b/.test(read));

// ---- Alter: editing where he stands now edits the scene 2 entry and leaves the base alone
await page.eval("(() => { document.querySelector('#sideBody [data-cardview=\"form\"]')?.click(); return 1; })()");
await until("!!document.querySelector('#sideBody [data-cardtab]')");
const now = await page.eval(`(() => { const b = document.querySelector('[data-f="now"]');
  return JSON.stringify({ box: !!b, value: b?.value ?? null, label: (b?.closest('.pane')?.innerText ?? '').toLowerCase() }); })()`).then(JSON.parse);
ok(`Alter: the first tab's box holds where he stands now (${JSON.stringify(now.value)})`, now.box && /owed eleven crowns/.test(now.value ?? ''));
ok("  under that name, with no Info", now.label.includes('where it stands now') && !/\binfo\b/.test(now.label));
await page.eval(`(() => { const b = document.querySelector('[data-f="now"]'); if (!b) return 0; b.value = b.value.replace('eleven', 'twelve');
  b.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
await page.eval("(() => { document.querySelector('#sideHead [data-saveentry]')?.click(); return 1; })()");
await wait(1200);
v = await view(sid);
const m2 = v.entries.find((e) => e.id === marek.id);
ok("  and Save writes it to the scene 2 entry", /owed twelve crowns/.test(m2.states.find((s) => s.fromChapter === 2)?.body ?? ''));
ok("  and leaves where he stood from scene 1 as it was", m2.body === base);

// ---- Over time: every entry, from scene 1, with its label and what it changed
await page.eval("(() => { document.querySelector('#sideBody [data-cardview=\"form\"]')?.click(); return 1; })()");
await until("!!document.querySelector('#sideBody [data-cardtab=\"time\"]')");
await page.eval("(() => { document.querySelector('#sideBody [data-cardtab=\"time\"]')?.click(); return 1; })()");
await wait(400);
const time = await page.eval(`(() => { const p = [...document.querySelectorAll('#sideBody .pane')].find((x) => !x.hidden);
  const rows = [...(p?.querySelectorAll('[data-otrow]') ?? [])];
  return JSON.stringify({ rows: rows.map((r) => r.dataset.otrow), first: (rows[0]?.innerText ?? '').toLowerCase(),
    two: (rows.find((r) => r.dataset.otrow === '2')?.innerText ?? '').toLowerCase(),
    base: !!p?.querySelector('[data-f="body"]'), all: (p?.innerText ?? '').toLowerCase() }); })()`).then(JSON.parse);
ok(`Over time lists every entry in scene order, from scene 1 (${time.rows})`, JSON.stringify(time.rows) === '["1","2","4"]');
ok("  the first is where he stood from scene 1, and is edited here", time.first.includes('scene 1') && time.base);
ok(`  scene 2 carries its label and what it changed (${JSON.stringify(time.two.slice(0, 160))})`,
   time.two.includes('owes the crowns') && /new:?[^\\n]*owed twelve crowns/.test(time.two));
ok("  and no Info", !/\binfo\b/.test(time.all));

// ---- Save on the header saves the in-force entry whole: its label from its row here, too
await page.eval(`(() => { const l = document.querySelector('[data-stl="${two.id}"]'); if (!l) return 0;
  l.value = 'owes twelve'; l.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
await page.eval("(() => { document.querySelector('#sideHead [data-saveentry]')?.click(); return 1; })()");
await wait(1200);
v = await view(sid);
ok("Save keeps the in-force entry's row in step: its label is saved too",
   v.entries.find((e) => e.id === marek.id).states.find((s) => s.id === two.id)?.label === 'owes twelve');

// ---- At scene 1, before the scene 2 entry opens, he stands where he stood from scene 1
const one = v.chapters.find((c) => c.index === 1);
await page.eval(`(() => { document.querySelector('[data-chapter="${one.id}"]')?.click(); return 1; })()`);
await until(`(document.querySelector('#col')?.innerText ?? '').length > 0`, 20);
await wait(800);
// BY A PRESS, not by the address: the scene opened is not in the address, and loading it would
// open the tale at its newest scene again.
await page.eval(`(() => { document.querySelector('[data-panel="threads"], [data-nav="threads"]')?.click(); return 1; })()`);
await until(`!!document.querySelector('[data-entry="${marek.id}"]')`);
await page.eval(`(() => { document.querySelector('[data-entry="${marek.id}"]').click(); return 1; })()`);
await until("!!document.querySelector('#sideBody .readface')");
const early = (await text('#sideBody .readface')).toLowerCase();
ok(`at scene 1 it is the scene 1 text, under the scene's name (${JSON.stringify(early.slice(0, 140))})`,
   early.includes('where it stands in') && !early.includes('owed twelve crowns') && !early.includes('from scene 2'));

console.log(red ? `\n  ${red} RED` : "\n  all green");
