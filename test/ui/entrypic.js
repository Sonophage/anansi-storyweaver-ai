// An optional picture on a thread: find it, take it, see it, remove it. Seth, 2026-09-01: "lets add
// an optional image field."
//
// NOT IN THE DEFAULT SET, same as `cover` and for the same reason: it needs ANANSI_SEARCH pointing at
// a working endpoint AND the open web. run.sh says so beside the other exclusions.
//
//   ANANSI_SEARCH='...' test/ui/run.sh entrypic
//
// WHAT IT PROVES THAT A UNIT TEST CANNOT: the bytes make the whole trip — search, server-side fetch
// (the browser cannot read an arbitrary image's bytes at all), the 900px shrink, the store, and the
// version-keyed URL serving it back as a JPEG.
const B = "http://127.0.0.1:5179";
let red = 0;
const ok = (l, g) => { if (!g) red++; console.log("  " + (g ? "ok  " : "RED ") + l); };

const made = await page.eval("(async () => {"
  + " const r = await (await fetch('/api/stories', { method:'POST', headers:{'Content-Type':'application/json'},"
  + " body: JSON.stringify({ title:'Picture Book', genre:'noir', premise:'x', pov:'third past' }) })).json();"
  + " const sid = r.storyId ?? r.id;"
  + " const v = await (await fetch('/api/entry', { method:'POST', headers:{'Content-Type':'application/json'},"
  + " body: JSON.stringify({ storyId: sid, entry: { id:'', title:'Aldis Fen', body:'[a man]',"
  + " entryType:'character', activation:'always_on', keys:[], lastEditor:'human' } }) })).json();"
  + " return JSON.stringify({ sid, eid: (v.entries||[]).find(e => e.title === 'Aldis Fen')?.id }); })()");
const { sid, eid } = JSON.parse(made);
ok(`a book with one thread (${sid} / ${eid})`, /^s-/.test(sid) && /^e-/.test(String(eid)));

await page.goto(B + "/#" + sid);
for (let i = 0; i < 40 && !(await page.visible('#modes')); i++) await wait(250);
await page.click('[data-nav="threads"]');
await wait(700);
await page.click(`[data-entry="${eid}"]`);
await wait(700);
// The form, not the face — the picture row lives on the editable side.
if (await page.eval(`!!document.querySelector('[data-cardview="form"]')`)) {
  await page.click('[data-cardview="form"]');
  await wait(600);
}
ok("the card form offers an optional picture",
   (await page.eval(`!!document.querySelector('[data-picfind="${eid}"]')`)) === true);
ok("  and says it is optional rather than showing an empty frame",
   /optional/i.test(await page.eval("document.getElementById('sideBody')?.innerText || ''")));

await page.click(`[data-picfind="${eid}"]`);
await wait(500);
await page.eval(`(() => { const q = document.querySelector('[data-picq]');
  q.value = 'venetian canal at night'; return 1; })()`);
await page.click('[data-picgo="1"]');
for (let i = 0; i < 60 && !(await page.eval("document.querySelectorAll('[data-pictake]').length")); i++) await wait(500);
const n = await page.eval("document.querySelectorAll('[data-pictake]').length");
ok(`  looking comes back with thumbnails (${n})`, n > 0);

await page.click('[data-pictake]');
let at = null;
for (let i = 0; i < 80; i++) {
  at = await page.eval(`(async () => { const v = await (await fetch('/api/story?story=${sid}')).json();
    return (v.entryImages || {})['${eid}'] ?? null; })()`);
  if (at) break; await wait(500);
}
ok(`  pressing one puts it on the thread (${at})`, !!at);
// SERVED BACK, which is the half a stored blob does not prove: the route validates magic bytes, so
// an image/jpeg coming out means the whole shrink-and-store path agreed.
const served = await page.eval(`(async () => { const r = await fetch('/api/entry/image?story=${sid}&entry=${eid}&v=${at}');
  return r.ok ? (r.headers.get('content-type')||'') + ' ' + (await r.blob()).size : 'not served'; })()`);
ok(`  and it is served back as a JPEG (${served})`, /image\/jpeg/.test(String(served)));

// AND IT COMES OFF AGAIN. Optional means removable, or it is a one-way decision.
await page.click(`[data-picdel="${eid}"]`);
for (let i = 0; i < 40; i++) {
  const still = await page.eval(`(async () => { const v = await (await fetch('/api/story?story=${sid}')).json();
    return (v.entryImages || {})['${eid}'] ?? null; })()`);
  if (!still) break; await wait(400);
}
const gone = await page.eval(`(async () => { const v = await (await fetch('/api/story?story=${sid}')).json();
  return (v.entryImages || {})['${eid}'] ?? null; })()`);
ok("  and Remove it takes it off again", !gone);
console.log(red ? `\n  ${red} RED` : "\n  all green");
