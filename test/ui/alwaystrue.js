// Always true on the thread's screens (#77, ADR 0005): who or what a thread is, above where it
// stands, with no switch and no wake words, and the word Facts on neither screen.
//
//   node --experimental-strip-types bench/drive.ts http://127.0.0.1:5179/ test/ui/alwaystrue.js
//
// The fixture's threads have no Always true, so one is written onto Aldis Fen first, switched OFF,
// as the update found 31 of them: the screens must draw it the same either way.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (m, cond) => { console.log(`  ${cond ? "ok  " : "FAIL"} ${m}${cond ? "" : "   <-- broken"}`); if (!cond) red++; };
const until = async (expr, n = 40, ms = 250) => { for (let i = 0; i < n; i++) { if (await page.eval(expr)) return true; await wait(ms); } return false; };
const view = (sid) => page.eval(`(async () => JSON.stringify(await (await fetch('/api/story?story=${sid}')).json()))()`).then(JSON.parse);

const sid = await page.eval("(async () => (await (await fetch('/api/stories')).json()).stories.find((s) => s.title === 'The Silver Key').id)()");
const aldis = (await view(sid)).entries.find((e) => e.title === 'Aldis Fen');
const made = await page.eval(`(async () => JSON.stringify(await (await fetch('/api/addon', { method: 'POST',
  headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storyId: ${JSON.stringify(sid)}, entryId: ${JSON.stringify(aldis.id)},
  addon: { slot: 'facts', name: 'facts', body: '[Aldis Fen: 34, ex-Watch sergeant, cannot swim]' } }) })).json()))()`).then(JSON.parse);
ok(`the fixture gets an Always true on Aldis Fen (${made.addonId ?? made.error})`, !!made.addonId);
const id = made.addonId;

// ---- Read
await page.goto(B + "/#" + sid + "/threads");
await until(`!!document.querySelector('[data-entry="${aldis.id}"]')`);
await page.eval(`(() => { document.querySelector('[data-entry="${aldis.id}"]').click(); return 1; })()`);
await until("!!document.querySelector('#sideBody .readface')");
const read = await page.eval(`(() => { const f = document.querySelector('#sideBody .readface');
  const t = (f?.innerText ?? '').toLowerCase(); const a = t.indexOf('always true'), s = t.indexOf('cannot swim');
  return JSON.stringify({ a, s, facts: /\\bfacts?\\b/i.test(t), sw: !!f?.querySelector('[data-addonon^="${id}:"]') }); })()`).then(JSON.parse);
ok(`Read: "Always true" heads its text (${read.a} / ${read.s})`, read.a >= 0 && read.s > read.a);
ok("  with no on/off switch on it", !read.sw);
ok("  and the word Facts is nowhere on the screen", !read.facts);

// ---- Alter
await page.eval("(() => { document.querySelector('#sideBody [data-cardview=\"form\"]').click(); return 1; })()");
await until("!!document.querySelector('#sideBody [data-cardtab]')");
const alter = await page.eval(`(() => { const p = [...document.querySelectorAll('#sideBody .pane')].find((x) => !x.hidden);
  const t = p?.innerText ?? '';
  return JSON.stringify({ heading: /always true/i.test(t), box: !!p?.querySelector('[data-ab="${id}"]'),
    keys: !!document.querySelector('[data-ak="${id}"]'), sw: !!document.querySelector('[data-addonon^="${id}:"]'),
    name: !!document.querySelector('[data-an="${id}"]'), facts: /\\bfacts?\\b/i.test(t) }); })()`).then(JSON.parse);
ok(`Alter: Always true is the first tab's own field (${JSON.stringify(alter)})`, alter.heading && alter.box);
ok("  with no wake words, no name and no switch", !alter.keys && !alter.name && !alter.sw);
ok("  and no Facts", !alter.facts);

// ---- What he reads: it is sent, though its old switch is off
const asked = await page.eval(`(async () => JSON.stringify(await (await fetch('/api/manifest', { method: 'POST',
  headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storyId: ${JSON.stringify(sid)} }) })).json()))()`).then(JSON.parse);
const block = (asked.manifest ?? asked).blocks?.find((b) => b.id === aldis.id);
ok(`and it reaches the model with its switch off (${block?.state ?? 'no block'})`, !!block && /cannot swim/.test(block.text ?? ''));

console.log(red ? `\n  ${red} RED` : "\n  all green");
