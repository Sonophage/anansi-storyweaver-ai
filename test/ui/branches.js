// Deleting a branch, from This scene → Branches (Seth, 2026-10-26: "there's no way for me to delete
// branches"). And the scene lines under the header: the ones behind you dimmed, not hidden.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/branches.js
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (m, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${m}${cond ? "" : "   <-- broken"}`); if (!cond) red++; };

const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find(s => s.title === 'The Silver Key').id)()");
const story = () => page.eval(`(async () => JSON.stringify(await (await fetch('/api/story?story=${sid}')).json()))()`).then(JSON.parse);
const post = (u, b) => page.eval(`(async () => JSON.stringify(await (await fetch(${JSON.stringify(u)}, { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify(b))} })).json()))()`).then(JSON.parse);

// A second path, made the way the passage menu's Branch makes one, then back to the first.
await page.goto(B + "/");
await wait(800);
const v0 = await story();
const first = v0.branches.find((b) => b.active).id;
const at = v0.passages.filter((p) => !p.isBreak)[1].id;
await post('/api/fork', { storyId: sid, passageId: at, name: 'the way not taken' });
await post('/api/branch', { storyId: sid, id: first });
const v1 = await story();
const other = v1.branches.find((b) => b.name === 'the way not taken');
ok(`the tale has two branches, the first one active (${v1.branches.length})`, v1.branches.length === 2 && !!other && !other.active);

await page.goto(B + "/#" + sid + "/chapter");
for (let i = 0; i < 40 && !(await page.eval("!!document.querySelector('[data-chaptab=\"branches\"]')")); i++) await wait(250);
await page.click('[data-chaptab="branches"]');
await wait(400);
ok("Branches offers Delete on the branch you are not on", await page.visible(`[data-delbranch="${other.id}"]`));
ok("  and not on the one you are on", !(await page.eval(`!!document.querySelector('[data-delbranch="${first}"]')`)));

// TWO PRESSES. The first asks; nothing goes.
await page.click(`[data-delbranch="${other.id}"]`);
await wait(400);
ok("one press asks first and deletes nothing", (await story()).branches.length === 2);
await page.click(`[data-delbranch="${other.id}"]`);
await wait(900);
const v2 = await story();
ok(`the second press deletes it (${v2.branches.map((b) => b.name)})`, v2.branches.length === 1 && v2.branches[0].id === first);
ok("  and the branch you are on keeps its prose", v2.passages.length === v1.passages.length);
ok("  and it is gone from the panel", !(await page.eval(`!!document.querySelector('[data-delbranch="${other.id}"]')`)));

// THE ONE YOU ARE ON IS REFUSED by the server too, whatever a client sends.
const refused = await post('/api/branch/delete', { storyId: sid, id: first });
ok(`the server refuses the branch you are on (${JSON.stringify(refused.error)})`, /branch you are on/.test(refused.error ?? ''));

// ---- the bar under the header: the threads sent now, by kind (since 2026-11-01 it is not the scenes)
await page.goto(B + "/#" + sid);
for (let i = 0; i < 40 && !(await page.visible('#ctxbar')); i++) await wait(250);
const segs = await page.eval(`JSON.stringify([...document.querySelectorAll('#ctxbar i')].map((i) => ({ c: i.className, k: i.dataset.kind ?? null })))`).then(JSON.parse);
console.log("  bar: " + JSON.stringify(segs));
ok(`the bar is threads by kind, or one quiet line when none is sent (${segs.length})`,
   segs.length > 0 && (segs.every((x) => /^(always|word)$/.test(x.c) && x.k) || (segs.length === 1 && segs[0].c === 'none')));

console.log(red ? `\n  ${red} RED` : "\n  all green");
